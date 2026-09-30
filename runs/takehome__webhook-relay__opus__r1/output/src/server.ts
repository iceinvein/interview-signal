import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Clock } from './clock.ts';
import type { TenantConfig } from './config.ts';
import { TenantDelivery, type DeliveryLimits, type Sender } from './delivery.ts';
import type { LogFields, Logger } from './log.ts';
import { SlidingWindowRateLimiter } from './rateLimiter.ts';

export interface Tenant {
  limiter: SlidingWindowRateLimiter;
  delivery: TenantDelivery;
}

export function createTenants(
  configs: Map<string, TenantConfig>,
  deps: { limits: DeliveryLimits; send: Sender; clock: Clock; log: Logger },
): Map<string, Tenant> {
  const tenants = new Map<string, Tenant>();
  for (const [id, config] of configs) {
    tenants.set(id, {
      limiter: new SlidingWindowRateLimiter(config.requestsPerSecond, 1000, deps.clock),
      delivery: new TenantDelivery(id, config, deps),
    });
  }
  return tenants;
}

export interface ServerOptions {
  tenants: Map<string, Tenant>;
  log: Logger;
  maxBodyBytes: number;
  newId?: () => string;
}

const ROUTE = /^\/webhooks\/([^/]+)$/;
/** Retry-After we suggest when a tenant's backlog is full. There is no precise answer, so keep it short. */
const BACKLOG_FULL_RETRY_AFTER_S = 5;

export function createRelayServer({ tenants, log, maxBodyBytes, newId = randomUUID }: ServerOptions): Server {
  return createServer((req, res) => {
    const started = Date.now();
    // Everything we know about the request, logged once when the response finishes.
    const info: LogFields = { method: req.method, path: req.url };
    res.on('finish', () => {
      log('info', 'request', { ...info, status: res.statusCode, durationMs: Date.now() - started });
    });
    handle(req, res, info).catch((err: unknown) => {
      log('error', 'unhandled error handling request', { ...info, error: String(err) });
      if (!res.headersSent) reply(res, 500, { error: 'internal error' });
      else res.destroy();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse, info: LogFields): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://relay').pathname;
    const match = ROUTE.exec(path);
    const tenantId = match ? safeDecode(match[1]!) : undefined;
    if (tenantId === undefined) return drainAndReply(req, res, 404, { error: 'not found' });
    info.tenantId = tenantId;

    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return drainAndReply(req, res, 405, { error: 'method not allowed' });
    }

    const tenant = tenants.get(tenantId);
    if (!tenant) return drainAndReply(req, res, 404, { error: 'unknown tenant' });

    // Rate limit before reading the body so a flood costs us as little as possible.
    const decision = tenant.limiter.tryAcquire();
    if (!decision.allowed) {
      res.setHeader('retry-after', String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))));
      return drainAndReply(req, res, 429, { error: 'rate limit exceeded' });
    }

    const body = await readBody(req, maxBodyBytes);
    if (body === undefined) {
      res.setHeader('connection', 'close');
      return reply(res, 413, { error: `body exceeds ${maxBodyBytes} bytes` });
    }

    const contentType = req.headers['content-type'];
    const id = newId();
    Object.assign(info, {
      webhookId: id,
      contentType,
      bodyBytes: body.byteLength,
      bodySha256: createHash('sha256').update(body).digest('hex'),
    });

    if (!tenant.delivery.enqueue({ id, body, contentType })) {
      res.setHeader('retry-after', String(BACKLOG_FULL_RETRY_AFTER_S));
      return reply(res, 503, { error: 'tenant backlog full' });
    }
    reply(res, 202, { id });
  }
}

/** Resolves to the body, or undefined if it is larger than `limit` bytes. */
async function readBody(req: IncomingMessage, limit: number): Promise<Buffer<ArrayBuffer> | undefined> {
  const declared = Number(req.headers['content-length']);
  if (declared > limit) {
    req.resume();
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.byteLength;
    if (size > limit) {
      req.resume();
      return undefined;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function drainAndReply(req: IncomingMessage, res: ServerResponse, status: number, body: object): void {
  req.resume();
  reply(res, status, body);
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
