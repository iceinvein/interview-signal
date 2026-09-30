import { randomUUID } from "node:crypto";
import http from "node:http";
import type { TenantConfig } from "./config.ts";
import { TenantDispatcher, type Sender, type SetTimer } from "./dispatcher.ts";
import type { Logger } from "./log.ts";
import { RateLimiter } from "./rateLimiter.ts";

export interface RelayOptions {
  tenants: Map<string, TenantConfig>;
  send: Sender;
  log: Logger;
  now?: () => number;
  setTimer?: SetTimer;
  maxBodyBytes?: number;
  perTenantConcurrency?: number;
  perTenantMaxQueuedBytes?: number;
}

interface TenantRuntime {
  limiter: RateLimiter;
  dispatcher: TenantDispatcher;
}

const defaultSetTimer: SetTimer = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export function createRelay(options: RelayOptions) {
  const { log } = options;
  const now = options.now ?? Date.now;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;

  const runtimes = new Map<string, TenantRuntime>();
  for (const [tenantId, config] of options.tenants) {
    runtimes.set(tenantId, {
      limiter: new RateLimiter(config.requestsPerSecond, now),
      dispatcher: new TenantDispatcher({
        tenantId,
        config,
        send: options.send,
        setTimer: options.setTimer ?? defaultSetTimer,
        log,
        concurrency: options.perTenantConcurrency ?? 8,
        maxQueuedBytes: options.perTenantMaxQueuedBytes ?? 16 * 1024 * 1024,
      }),
    });
  }

  const server = http.createServer(async (req, res) => {
    const reply = (status: number, headers: Record<string, string | number> = {}) => {
      res.writeHead(status, { "Content-Length": 0, ...headers });
      res.end();
    };
    // Never log the body or headers: payloads carry customers' API keys and tokens.
    const logRequest = (fields: Record<string, unknown>) =>
      log("request", { method: req.method, ...fields });

    const match = /^\/webhooks\/([^/]+)$/.exec(req.url?.split("?")[0] ?? "");
    if (!match) {
      logRequest({ status: 404, reason: "no_route" });
      return reply(404);
    }
    let tenantId: string;
    try {
      tenantId = decodeURIComponent(match[1]!);
    } catch {
      logRequest({ status: 404, reason: "bad_tenant_id" });
      return reply(404);
    }
    if (req.method !== "POST") {
      logRequest({ tenantId, status: 405 });
      return reply(405, { Allow: "POST" });
    }
    const tenant = runtimes.get(tenantId);
    if (!tenant) {
      logRequest({ tenantId, status: 404, reason: "unknown_tenant" });
      return reply(404);
    }

    const body = await readBody(req, maxBodyBytes);
    if (body === undefined) {
      logRequest({ tenantId, status: 413 });
      return reply(413, { Connection: "close" });
    }

    const contentType = req.headers["content-type"];
    const base = { tenantId, bytes: body.length, contentType };

    // Checked before the rate limiter so a rejected request doesn't consume a slot.
    if (!tenant.dispatcher.hasCapacity(body.length)) {
      logRequest({ ...base, status: 503, reason: "tenant_backlog_full" });
      return reply(503, { "Retry-After": 5 });
    }
    const decision = tenant.limiter.tryAcquire();
    if (!decision.allowed) {
      logRequest({ ...base, status: 429, retryAfterSeconds: decision.retryAfterSeconds });
      return reply(429, { "Retry-After": decision.retryAfterSeconds });
    }

    const webhookId = randomUUID();
    tenant.dispatcher.enqueue({ id: webhookId, body, contentType });
    logRequest({ ...base, status: 202, webhookId });
    reply(202);
  });

  return {
    server,
    /** Stops accepting connections and cancels pending retries (in-memory events are lost). */
    close(): Promise<void> {
      for (const t of runtimes.values()) t.dispatcher.close();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

/** Returns undefined if the body exceeds the limit. */
function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const declared = Number(req.headers["content-length"]);
    if (declared > limit) return resolve(undefined);
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        req.pause();
        resolve(undefined);
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(undefined));
  });
}
