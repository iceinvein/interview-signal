import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Tenants } from "./config.ts";
import { TenantDispatcher, type Schedule, type Sender } from "./dispatcher.ts";
import type { Logger } from "./log.ts";
import { SlidingWindowLimiter } from "./rate-limiter.ts";

export interface RelayOptions {
  tenants: Tenants;
  send: Sender;
  log: Logger;
  now?: () => number;
  schedule?: Schedule;
  newId?: () => string;
  maxBodyBytes?: number;
  maxConcurrencyPerTenant?: number;
  maxPendingPerTenant?: number;
}

interface TenantState {
  limiter: SlidingWindowLimiter;
  dispatcher: TenantDispatcher;
}

const ROUTE = /^\/webhooks\/([^/]+)$/;

export function createRelay(options: RelayOptions): Server {
  const { log } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;

  const state = new Map<string, TenantState>();
  for (const [tenantId, config] of options.tenants) {
    state.set(tenantId, {
      limiter: new SlidingWindowLimiter(config.requestsPerSecond, 1000, now),
      dispatcher: new TenantDispatcher(config, {
        send: options.send,
        schedule: options.schedule,
        maxConcurrency: options.maxConcurrencyPerTenant ?? 10,
        maxPending: options.maxPendingPerTenant ?? 1000,
        onEvent: (e) => log("delivery_attempt", { ...e }),
      }),
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse, path: string, fields: Record<string, unknown>) {
    const match = ROUTE.exec(path);
    if (!match) return reply(res, 404, { error: "not found" });
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return reply(res, 405, { error: "method not allowed" });
    }

    const tenantId = safeDecode(match[1]!);
    if (tenantId === undefined) return reply(res, 400, { error: "malformed tenant id" });
    fields.tenantId = tenantId;
    const tenant = state.get(tenantId);
    if (!tenant) return reply(res, 404, { error: "unknown tenant" });

    const declaredLength = Number(req.headers["content-length"] ?? 0);
    const body = declaredLength > maxBodyBytes ? null : await readBody(req, maxBodyBytes);
    if (body === null) {
      res.setHeader("connection", "close");
      return reply(res, 413, { error: "payload too large" });
    }
    const contentType = req.headers["content-type"];
    fields.contentType = contentType;
    fields.bodyBytes = body.length;
    fields.bodySha256 = createHash("sha256").update(body).digest("hex");

    // Check the backlog before taking a rate-limit slot so a 503 doesn't burn one.
    if (!tenant.dispatcher.hasCapacity()) {
      res.setHeader("retry-after", "1");
      return reply(res, 503, { error: "tenant backlog full" });
    }
    const waitMs = tenant.limiter.tryAcquire();
    if (waitMs > 0) {
      res.setHeader("retry-after", String(Math.max(1, Math.ceil(waitMs / 1000))));
      return reply(res, 429, { error: "rate limit exceeded" });
    }

    const id = newId();
    fields.webhookId = id;
    tenant.dispatcher.enqueue({ id, tenantId, body, contentType });
    reply(res, 202, { id });
  }

  return createServer((req, res) => {
    const started = now();
    // Log the path only: query strings are another place credentials turn up.
    const path = (req.url ?? "/").split("?", 1)[0]!;
    const fields: Record<string, unknown> = { method: req.method, path };
    res.on("finish", () => {
      log("request", { ...fields, status: res.statusCode, durationMs: now() - started });
    });
    handle(req, res, path, fields).catch((err: unknown) => {
      fields.error = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) reply(res, 500, { error: "internal error" });
      else res.destroy();
    });
  });
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

/** Resolves with the body, or null as soon as it exceeds `limit` (the rest is discarded). */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.off("data", onData);
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
