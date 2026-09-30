import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Relay } from "./relay.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";
import type { Clock, Logger, Send, Tenant } from "./types.ts";

export interface ServerOptions {
  tenants: Map<string, Tenant>;
  send: Send;
  clock: Clock;
  log: Logger;
  maxBodyBytes?: number;
}

const ROUTE = /^\/webhooks\/([^/]+)\/?$/;

export function createRelayServer(opts: ServerOptions): { server: Server; relay: Relay } {
  const { tenants, clock, log } = opts;
  const maxBodyBytes = opts.maxBodyBytes ?? 1024 * 1024;
  const relay = new Relay(opts.send, clock, log);
  const limiters = new Map<string, SlidingWindowLimiter>();
  for (const [id, t] of tenants) {
    limiters.set(id, new SlidingWindowLimiter(t.requestsPerSecond, () => clock.now()));
  }

  const reply = (res: ServerResponse, status: number, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Length": "0", ...headers }).end();
  };

  const server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? "").split("?")[0]!;
      const match = ROUTE.exec(path);
      if (!match) return reply(res, 404);
      let tenantId: string;
      try {
        tenantId = decodeURIComponent(match[1]!);
      } catch {
        return reply(res, 404);
      }
      // Map lookup (not object index) so ids like "constructor" are unknown.
      const tenant = tenants.get(tenantId);
      if (!tenant) return reply(res, 404);
      if (req.method !== "POST") return reply(res, 405, { Allow: "POST" });

      // Limit before buffering the body so a flooding tenant costs us little.
      const decision = limiters.get(tenantId)!.tryAcquire();
      if (!decision.allowed) {
        const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
        log({ msg: "rate limited", tenant: tenantId, retryAfterSeconds: retryAfter });
        return reply(res, 429, { "Retry-After": String(retryAfter) });
      }

      const body = await readBody(req, maxBodyBytes);
      if (body === null) {
        log({ msg: "body too large", tenant: tenantId, limit: maxBodyBytes });
        res.on("finish", () => req.destroy());
        return reply(res, 413, { Connection: "close" });
      }

      const webhookId = randomUUID();
      const contentType = req.headers["content-type"];
      // Deliberately NOT logging the body or headers: payloads carry customers'
      // API keys and tokens. See README.
      log({
        msg: "webhook accepted",
        tenant: tenantId,
        webhookId,
        contentType: contentType ?? null,
        bytes: body.length,
      });
      relay.enqueue(tenantId, tenant, { id: webhookId, url: tenant.destination, body, contentType });
      reply(res, 202);
    } catch (err) {
      log({ msg: "internal error", error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) reply(res, 500);
    }
  });

  return { server, relay };
}

/** Resolves null if the body exceeds the limit. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        req.pause();
        resolve(null);
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
