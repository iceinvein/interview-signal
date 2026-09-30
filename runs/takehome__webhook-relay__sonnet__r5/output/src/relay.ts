import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { TenantConfig } from "./config.ts";
import { TenantDispatcher, type Log, type Send } from "./dispatcher.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";

export interface RelayOptions {
  tenants: Map<string, TenantConfig>;
  send: Send;
  log: Log;
  now?: () => number;
  maxBodyBytes?: number;
  concurrencyPerTenant?: number;
  maxOutstandingPerTenant?: number;
}

const PREFIX = "/webhooks/";

export function createRelay(opts: RelayOptions): Server {
  const now = opts.now ?? Date.now;
  const maxBodyBytes = opts.maxBodyBytes ?? 1024 * 1024;
  const state = new Map<string, { limiter: SlidingWindowLimiter; dispatcher: TenantDispatcher }>();
  for (const [id, config] of opts.tenants) {
    state.set(id, {
      limiter: new SlidingWindowLimiter(config.requestsPerSecond, now),
      dispatcher: new TenantDispatcher(id, config, opts.send, opts.log, {
        concurrency: opts.concurrencyPerTenant ?? 8,
        maxOutstanding: opts.maxOutstandingPerTenant ?? 1000,
      }),
    });
  }

  return createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      opts.log({ event: "internal_error", error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) reply(res, 500);
    }
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "").split("?")[0]!;
    if (!path.startsWith(PREFIX)) return reply(res, 404);
    let tenantId: string;
    try {
      tenantId = decodeURIComponent(path.slice(PREFIX.length));
    } catch {
      return reply(res, 404);
    }
    const tenant = state.get(tenantId);
    if (!tenant) return reply(res, 404);
    if (req.method !== "POST") return reply(res, 405, { Allow: "POST" });

    const body = await readBody(req, maxBodyBytes);
    if (body === null) return reply(res, 413);

    const contentType = req.headers["content-type"];
    const meta = { tenant: tenantId, bytes: body.length, contentType };

    // Capacity is checked before the limiter so a request we cannot hold does not use up a rate-limit slot.
    if (tenant.dispatcher.isFull) {
      opts.log({ event: "rejected", reason: "queue_full", ...meta });
      return reply(res, 503, { "Retry-After": "1" });
    }
    const waitMs = tenant.limiter.tryAcquire();
    if (waitMs > 0) {
      opts.log({ event: "rejected", reason: "rate_limited", ...meta });
      return reply(res, 429, { "Retry-After": String(Math.max(1, Math.ceil(waitMs / 1000))) });
    }

    const webhook = { id: randomUUID(), body, contentType };
    tenant.dispatcher.offer(webhook);
    opts.log({ event: "accepted", webhookId: webhook.id, ...meta });
    reply(res, 202, { "X-Webhook-Id": webhook.id });
  }
}

function reply(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Length": "0", ...headers }).end();
}

/** Buffers the body, or resolves null (after draining) if it exceeds `limit`. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = declared > limit;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) tooBig = true;
      if (!tooBig) chunks.push(chunk); // stop buffering once over the limit, keep draining
    });
    req.on("end", () => resolve(tooBig ? null : Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
