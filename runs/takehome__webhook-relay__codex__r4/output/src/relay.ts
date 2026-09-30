import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { TenantConfig, Tenants } from './config';

export interface LogEntry {
  kind: 'incoming' | 'delivery';
  [key: string]: unknown;
}

export interface Dependencies {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
  log?: (entry: LogEntry) => void;
  id?: () => string;
}

interface Event {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
}

class SlidingWindowLimiter {
  private timestamps: number[] = [];

  constructor(private readonly limit: number, private readonly now: () => number) {}

  accept(): { allowed: boolean; retryAfterSeconds?: number } {
    const current = this.now();
    while (this.timestamps.length && this.timestamps[0]! <= current - 1000) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((this.timestamps[0]! + 1000 - current) / 1000)) };
    }
    this.timestamps.push(current);
    return { allowed: true };
  }
}

class DeliveryQueue {
  private readonly events: Event[] = [];
  private running = false;

  constructor(
    private readonly config: TenantConfig,
    private readonly send: typeof fetch,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly log: (entry: LogEntry) => void,
  ) {}

  enqueue(event: Event): void {
    this.events.push(event);
    if (!this.running) {
      this.running = true;
      setImmediate(() => { void this.drain(); });
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.events.length) await this.deliver(this.events[0]!);
    } finally {
      this.running = false;
      if (this.events.length) {
        this.running = true;
        setImmediate(() => { void this.drain(); });
      }
    }
  }

  private async deliver(event: Event): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const headers: Record<string, string> = { 'X-Webhook-Id': event.id };
        if (event.contentType !== undefined) headers['Content-Type'] = event.contentType;
        const response = await this.send(this.config.destination, {
          method: 'POST', headers, body: new Uint8Array(event.body),
          signal: AbortSignal.timeout(10_000),
        });
        void response.body?.cancel().catch(() => {});
        const delivered = response.status >= 200 && response.status < 300;
        this.log({ kind: 'delivery', tenantId: event.tenantId, webhookId: event.id, attempt, status: response.status, delivered });
        if (delivered) break;
      } catch (error) {
        this.log({ kind: 'delivery', tenantId: event.tenantId, webhookId: event.id, attempt, delivered: false, error: String(error) });
      }
      if (attempt < this.config.maxAttempts) {
        await this.sleep(this.config.initialBackoffMs * 2 ** (attempt - 1));
      }
    }
    this.events.shift();
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function realSleep(ms: number): Promise<void> {
  const maxTimerMs = 2 ** 31 - 1;
  while (ms > 0) {
    const part = Math.min(ms, maxTimerMs);
    await new Promise<void>(resolve => setTimeout(resolve, part));
    ms -= part;
  }
}

export function createRelay(tenants: Tenants, dependencies: Dependencies = {}) {
  const now = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? realSleep;
  const send = dependencies.fetch ?? fetch;
  const log = dependencies.log ?? ((entry: LogEntry) => console.log(JSON.stringify(entry)));
  const id = dependencies.id ?? randomUUID;
  const limiters = new Map<string, SlidingWindowLimiter>();
  const queues = new Map<string, DeliveryQueue>();
  for (const [tenantId, config] of tenants) {
    limiters.set(tenantId, new SlidingWindowLimiter(config.requestsPerSecond, now));
    queues.set(tenantId, new DeliveryQueue(config, send, sleep, log));
  }

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let body: Buffer = Buffer.alloc(0);
    let status = 500;
    let tenantId: string | undefined;
    let webhookId: string | undefined;
    let readError: string | undefined;
    try {
      body = await readBody(request);
      const match = /^\/webhooks\/([^/]+)$/.exec(new URL(request.url ?? '/', 'http://localhost').pathname);
      try { tenantId = match ? decodeURIComponent(match[1]!) : undefined; }
      catch { status = 400; response.writeHead(status).end(); return; }

      if (request.method !== 'POST' || tenantId === undefined) {
        status = 404;
      } else if (!tenants.has(tenantId)) {
        status = 404;
      } else {
        const limit = limiters.get(tenantId)!.accept();
        if (!limit.allowed) {
          status = 429;
          response.setHeader('Retry-After', String(limit.retryAfterSeconds));
        } else {
          webhookId = id();
          queues.get(tenantId)!.enqueue({ id: webhookId, tenantId, body, contentType: request.headers['content-type'] });
          response.setHeader('X-Webhook-Id', webhookId);
          status = 202;
        }
      }
      response.writeHead(status).end();
    } catch (error) {
      status = 400;
      readError = String(error);
      if (!response.headersSent && !response.destroyed) response.writeHead(status).end();
    } finally {
      log({ kind: 'incoming', method: request.method, path: request.url, tenantId, webhookId,
        status, contentType: request.headers['content-type'], bodyBase64: body.toString('base64'), readError });
    }
  });
}
