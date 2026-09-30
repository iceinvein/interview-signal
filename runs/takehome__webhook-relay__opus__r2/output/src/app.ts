import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { TenantConfig, Tenants } from "./config.ts";
import { TenantDeliveryQueue, type QueueLimits, type Sender, type Sleep } from "./delivery.ts";
import type { Logger } from "./logger.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";

export interface AppOptions {
  tenants: Tenants;
  send: Sender;
  sleep: Sleep;
  /** Monotonic milliseconds, used for rate limiting. */
  now: () => number;
  logger: Logger;
  limits: QueueLimits;
  maxBodyBytes: number;
  newId?: () => string;
}

interface Tenant {
  config: TenantConfig;
  limiter: SlidingWindowLimiter;
  queue: TenantDeliveryQueue;
}

export interface App {
  server: Server;
  /** Resolves once every accepted webhook has been delivered or abandoned. */
  whenIdle(): Promise<void>;
}

const WEBHOOK_PATH = /^\/webhooks\/([^/]+)$/;

export function createApp(options: AppOptions): App {
  const { logger, maxBodyBytes, newId = randomUUID } = options;

  const tenants = new Map<string, Tenant>();
  for (const [id, config] of options.tenants) {
    tenants.set(id, {
      config,
      limiter: new SlidingWindowLimiter(config.requestsPerSecond, 1000, options.now),
      queue: new TenantDeliveryQueue(id, config, options),
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://relay.invalid").pathname;
    const match = WEBHOOK_PATH.exec(path);
    if (!match) return reply(res, 404, { error: "not found" });
    if (req.method !== "POST") return reply(res, 405, { error: "method not allowed" }, { allow: "POST" });

    const tenantId = safeDecode(match[1]!);
    const tenant = tenantId === undefined ? undefined : tenants.get(tenantId);
    const requestLog = { tenantId, contentType: req.headers["content-type"] };
    if (tenantId === undefined || !tenant) {
      logger.info("webhook.rejected", { ...requestLog, status: 404, reason: "unknown tenant" });
      return reply(res, 404, { error: "unknown tenant" });
    }

    // Rate-limit before reading the body so an over-limit sender costs us as little as possible.
    const admission = tenant.limiter.tryAcquire();
    if (!admission.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(admission.retryAfterMs / 1000));
      logger.info("webhook.rejected", { ...requestLog, status: 429, reason: "rate limited" });
      return reply(res, 429, { error: "rate limit exceeded" }, { "retry-after": String(retryAfterSeconds) });
    }

    const body = await readBody(req, maxBodyBytes);
    if (body === undefined) {
      logger.info("webhook.rejected", { ...requestLog, status: 413, reason: "body too large" });
      return reply(res, 413, { error: "body too large" }, { connection: "close" });
    }

    const webhook = { id: newId(), tenantId, body, contentType: req.headers["content-type"] };
    const bodyLog = {
      webhookId: webhook.id,
      bodyBytes: body.length,
      bodySha256: createHash("sha256").update(body).digest("hex"),
    };
    if (!tenant.queue.enqueue(webhook)) {
      logger.warn("webhook.rejected", { ...requestLog, ...bodyLog, status: 503, reason: "tenant backlog full" });
      return reply(res, 503, { error: "backlog full" }, { "retry-after": "1" });
    }

    logger.info("webhook.accepted", { ...requestLog, ...bodyLog, status: 202 });
    reply(res, 202, { id: webhook.id });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      logger.error("request.failed", { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) reply(res, 500, { error: "internal error" });
      else res.destroy();
    });
  });

  return {
    server,
    async whenIdle() {
      await Promise.all([...tenants.values()].map((t) => t.queue.whenIdle()));
    },
  };
}

function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/** Buffers the body, or returns undefined as soon as it exceeds `limit` bytes. */
async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const declared = Number(req.headers["content-length"]);
  if (declared > limit) return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function reply(
  res: ServerResponse,
  status: number,
  body: object,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}
