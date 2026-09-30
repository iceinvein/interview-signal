import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { Tenants } from './config.js';
import { DeliveryQueue, type Logger, type Post } from './delivery.js';
import { postWebhook } from './transport.js';

export interface RelayOptions {
  now?: () => number;
  newId?: () => string;
  post?: Post;
  log?: Logger;
  wait?: (ms: number) => Promise<void>;
}

export const jsonLog: Logger = (record) => {
  process.stdout.write(`${JSON.stringify(record)}\n`);
};

class RateLimiter {
  private readonly accepted = new Map<string, number[]>();

  constructor(private readonly tenants: Tenants, private readonly now: () => number) {
    for (const id of Object.keys(tenants)) this.accepted.set(id, []);
  }

  /** Returns whole seconds for Retry-After, or zero when accepted. */
  check(tenantId: string): number {
    const timestamps = this.accepted.get(tenantId)!;
    const now = this.now();
    while (timestamps.length > 0 && timestamps[0]! <= now - 1000) timestamps.shift();
    if (timestamps.length >= this.tenants[tenantId]!.requestsPerSecond) {
      return Math.max(1, Math.ceil((timestamps[0]! + 1000 - now) / 1000));
    }
    timestamps.push(now);
    return 0;
  }
}

export function createRelay(tenants: Tenants, options: RelayOptions = {}): Server {
  const log = options.log ?? jsonLog;
  const queue = new DeliveryQueue(tenants, options.post ?? postWebhook, log, options.wait);
  const limiter = new RateLimiter(tenants, options.now ?? (() => performance.now()));
  const newId = options.newId ?? randomUUID;

  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      log({ event: 'request_error', error: error instanceof Error ? error.message : String(error) });
      if (!response.headersSent) response.writeHead(500).end();
      else response.destroy();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
    } catch {
      logRequest(request, Buffer.concat(chunks), 400, true);
      if (!response.destroyed) response.writeHead(400).end();
      return;
    }
    const body = Buffer.concat(chunks);
    const path = request.url?.split('?')[0] ?? '';
    const match = /^\/webhooks\/([^/]+)$/.exec(path);
    let tenantId: string | undefined;
    try {
      if (match) tenantId = decodeURIComponent(match[1]!);
    } catch {
      // Malformed percent escapes are an unknown route.
    }

    if (!tenantId || !Object.hasOwn(tenants, tenantId)) {
      logRequest(request, body, 404);
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'POST') {
      logRequest(request, body, 405);
      response.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    const retryAfter = limiter.check(tenantId);
    if (retryAfter > 0) {
      logRequest(request, body, 429, false, tenantId);
      response.writeHead(429, { 'Retry-After': String(retryAfter) }).end();
      return;
    }
    const id = newId();
    logRequest(request, body, 202, false, tenantId, id);
    queue.enqueue({ id, tenantId, body, contentType: request.headers['content-type'] });
    response.writeHead(202).end();
  }

  function logRequest(request: IncomingMessage, body: Buffer, status: number,
    incomplete = false, tenantId?: string, webhookId?: string): void {
    log({ event: 'incoming_request', method: request.method, path: request.url,
      tenantId: tenantId ?? null, webhookId: webhookId ?? null,
      contentType: request.headers['content-type'] ?? null,
      bodyBase64: body.toString('base64'), incomplete, status });
  }
}
