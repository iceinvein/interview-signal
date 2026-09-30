import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Clock } from "./clock.ts";
import type { Tenants } from "./config.ts";
import { TenantQueue, type QueueLimits, type Sender } from "./delivery.ts";
import type { Logger } from "./logger.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";

export interface RelayOptions {
  tenants: Tenants;
  send: Sender;
  clock: Clock;
  log: Logger;
  maxBodyBytes: number;
  queue: QueueLimits;
  newId?: () => string;
}

interface TenantRuntime {
  limiter: SlidingWindowLimiter;
  queue: TenantQueue;
}

const ROUTE = /^\/webhooks\/([^/]+)$/;

export function createRelayServer(opts: RelayOptions): Server {
  const { clock, log, maxBodyBytes } = opts;
  const newId = opts.newId ?? randomUUID;

  const runtimes = new Map<string, TenantRuntime>();
  for (const [id, config] of opts.tenants) {
    runtimes.set(id, {
      limiter: new SlidingWindowLimiter(config.requestsPerSecond, 1000, clock),
      queue: new TenantQueue(id, config, opts.queue, opts.send, clock, log),
    });
  }

  return createServer(async (req, res) => {
    const started = clock.now();
    const outcome = await handle(req, res).catch((err: Error) => {
      log.error("unhandled error", { error: err.message });
      if (!res.headersSent) reply(res, 500, { error: "internal error" });
      return { status: 500 } as Outcome;
    });
    // Deliberately metadata only: see README ("Logging request bodies").
    log.info("request", {
      method: req.method,
      // Pathname only: query strings are another place senders put tokens.
      path: new URL(req.url ?? "/", "http://relay").pathname,
      durationMs: clock.now() - started,
      contentType: req.headers["content-type"],
      ...outcome,
    });
  });

  type Outcome = { status: number; tenantId?: string; webhookId?: string; bodyBytes?: number; bodySha256?: string };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<Outcome> {
    const match = ROUTE.exec(new URL(req.url ?? "/", "http://relay").pathname);
    if (!match) {
      return discard(req, res, 404, { error: "not found" });
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return discard(req, res, 405, { error: "method not allowed" });
    }

    let tenantId: string;
    try {
      tenantId = decodeURIComponent(match[1]!);
    } catch {
      return discard(req, res, 404, { error: "unknown tenant" });
    }
    const tenant = runtimes.get(tenantId);
    if (!tenant) {
      return discard(req, res, 404, { error: "unknown tenant" });
    }

    // Checked before reading the body so over-limit senders cost us as little as possible.
    const decision = tenant.limiter.tryAcquire();
    if (!decision.allowed) {
      res.setHeader("retry-after", String(Math.ceil(decision.retryAfterMs / 1000)));
      return { ...discard(req, res, 429, { error: "rate limit exceeded" }), tenantId };
    }

    const body = await readBody(req, maxBodyBytes);
    if (body === "too-large") {
      res.setHeader("connection", "close");
      reply(res, 413, { error: `body exceeds ${maxBodyBytes} bytes` });
      return { status: 413, tenantId };
    }
    const bodyInfo = { bodyBytes: body.length, bodySha256: createHash("sha256").update(body).digest("hex") };

    const webhookId = newId();
    const accepted = tenant.queue.enqueue({
      id: webhookId,
      tenantId,
      body,
      contentType: req.headers["content-type"],
    });
    if (!accepted) {
      res.setHeader("retry-after", "1");
      reply(res, 503, { error: "tenant backlog full" });
      return { status: 503, tenantId, ...bodyInfo };
    }

    reply(res, 202, { id: webhookId });
    return { status: 202, tenantId, webhookId, ...bodyInfo };
  }
}

/** Reply without reading the request body. */
function discard(req: IncomingMessage, res: ServerResponse, status: number, payload: object): { status: number } {
  req.resume();
  reply(res, status, payload);
  return { status };
}

function reply(res: ServerResponse, status: number, payload: object): void {
  const json = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  res.end(json);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | "too-large"> {
  const declared = Number(req.headers["content-length"]);
  if (declared > maxBytes) {
    req.resume();
    return "too-large";
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBytes) {
      req.resume();
      return "too-large";
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
