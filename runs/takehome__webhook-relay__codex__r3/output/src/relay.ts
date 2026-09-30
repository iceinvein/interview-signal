import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { TenantConfig, Tenants } from './config.js';

export interface Webhook {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType?: string;
}

export interface LogRecord {
  kind: 'request' | 'delivery';
  [key: string]: unknown;
}

export interface Dependencies {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  log?: (record: LogRecord) => void;
  id?: () => string;
}

const DELIVERY_TIMEOUT_MS = 5_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class SlidingWindowLimiter {
  private acceptedAt: number[] = [];

  constructor(private readonly limit: number, private readonly now: () => number) {}

  check(): { allowed: boolean; retryAfterSeconds?: number } {
    const now = this.now();
    while (this.acceptedAt.length > 0 && this.acceptedAt[0] <= now - 1000) {
      this.acceptedAt.shift();
    }
    if (this.acceptedAt.length >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((this.acceptedAt[0] + 1000 - now) / 1000)) };
    }
    this.acceptedAt.push(now);
    return { allowed: true };
  }
}

class TenantWorker {
  private queue: Webhook[] = [];
  private head = 0;
  private running = false;

  constructor(
    private readonly tenant: TenantConfig,
    private readonly fetcher: typeof globalThis.fetch,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly log: (record: LogRecord) => void,
  ) {}

  enqueue(event: Webhook): void {
    this.queue.push(event);
    if (!this.running) {
      this.running = true;
      void this.drain();
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.head < this.queue.length) {
        const event = this.queue[this.head];
        try {
          await this.deliver(event);
        } catch (cause) {
          // An internal error must not strand this tenant's entire queue.
          try {
            this.log({
              kind: 'delivery', tenantId: event.tenantId, webhookId: event.id,
              error: cause instanceof Error ? cause.message : String(cause), delivered: false,
            });
          } catch { /* The logger itself may be the failing dependency. */ }
        }
        this.head++;
        if (this.head === this.queue.length) {
          this.queue = [];
          this.head = 0;
        } else if (this.head > 1024 && this.head * 2 > this.queue.length) {
          this.queue = this.queue.slice(this.head);
          this.head = 0;
        }
      }
    } finally {
      this.running = false;
      if (this.head < this.queue.length) {
        this.running = true;
        void this.drain();
      }
    }
  }

  private async deliver(event: Webhook): Promise<void> {
    for (let attempt = 1; attempt <= this.tenant.maxAttempts; attempt++) {
      let status: number | undefined;
      let error: string | undefined;
      try {
        const response = await this.fetcher(this.tenant.destination, {
          method: 'POST',
          body: new Uint8Array(event.body),
          headers: {
            'X-Webhook-Id': event.id,
            ...(event.contentType === undefined ? {} : { 'Content-Type': event.contentType }),
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        status = response.status;
        void response.body?.cancel().catch(() => {});
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }

      const delivered = status !== undefined && status >= 200 && status < 300;
      this.log({ kind: 'delivery', tenantId: event.tenantId, webhookId: event.id, attempt, status, error, delivered });
      if (delivered) return;
      if (attempt < this.tenant.maxAttempts) {
        await this.sleep(this.tenant.initialBackoffMs * 2 ** (attempt - 1));
      }
    }
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
}

function reply(response: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  response.end(message);
}

export function createRelay(tenants: Tenants, dependencies: Dependencies = {}): Server {
  const now = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? defaultSleep;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const log = dependencies.log ?? ((record: LogRecord) => console.log(JSON.stringify(record)));
  const id = dependencies.id ?? randomUUID;
  const states = new Map<string, { limiter: SlidingWindowLimiter; worker: TenantWorker }>();
  for (const [tenantId, config] of Object.entries(tenants)) {
    states.set(tenantId, {
      limiter: new SlidingWindowLimiter(config.requestsPerSecond, now),
      worker: new TenantWorker(config, fetcher, sleep, log),
    });
  }

  return createServer((request, response) => {
    void (async () => {
      let body: Buffer;
      try {
        body = await readBody(request);
      } catch {
        if (!response.destroyed) reply(response, 400, 'Invalid request body');
        return;
      }

      // Base64 preserves arbitrary bytes, including invalid UTF-8 and embedded NULs.
      log({ kind: 'request', method: request.method, path: request.url, contentType: request.headers['content-type'], bodyBase64: body.toString('base64') });

      const match = /^\/webhooks\/([^/]+)$/.exec(request.url?.split('?')[0] ?? '');
      if (!match) {
        reply(response, 404, 'Not Found');
        return;
      }
      if (request.method !== 'POST') {
        reply(response, 405, 'Method Not Allowed', { Allow: 'POST' });
        return;
      }
      let tenantId: string;
      try {
        tenantId = decodeURIComponent(match[1]);
      } catch {
        reply(response, 400, 'Invalid tenant ID');
        return;
      }
      const state = states.get(tenantId);
      if (!state) {
        reply(response, 404, 'Not Found');
        return;
      }
      const limit = state.limiter.check();
      if (!limit.allowed) {
        reply(response, 429, 'Too Many Requests', { 'Retry-After': String(limit.retryAfterSeconds) });
        return;
      }

      const event: Webhook = {
        id: id(), tenantId, body,
        contentType: typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : undefined,
      };
      state.worker.enqueue(event);
      reply(response, 202, 'Accepted');
    })().catch(error => {
      try {
        log({ kind: 'delivery', error: error instanceof Error ? error.message : String(error) });
      } catch { /* Preserve the HTTP response if logging fails. */ }
      if (!response.headersSent && !response.destroyed) reply(response, 500, 'Internal Server Error');
    });
  });
}
