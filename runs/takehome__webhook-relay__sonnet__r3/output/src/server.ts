import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Logger } from "./logger.ts";
import type { Relay } from "./relay.ts";

const MAX_BODY_BYTES = 1024 * 1024;

class TooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new TooLarge());
        req.pause();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-length": "0", ...headers }).end();
}

function tenantIdFromPath(url: string | undefined): string | undefined {
  const path = new URL(url ?? "/", "http://x").pathname;
  const m = /^\/webhooks\/([^/]+)$/.exec(path);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return undefined;
  }
}

export function createApp(relay: Relay, log: Logger): Server {
  return createServer(async (req, res) => {
    const tenantId = tenantIdFromPath(req.url);
    if (tenantId === undefined) return reply(res, 404);
    if (req.method !== "POST") return reply(res, 405, { allow: "POST" });
    if (!relay.hasTenant(tenantId)) {
      req.resume();
      log("webhook_rejected", { tenant: tenantId, reason: "unknown_tenant" });
      return reply(res, 404);
    }

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (err) {
      const status = err instanceof TooLarge ? 413 : 400;
      log("webhook_rejected", { tenant: tenantId, reason: status === 413 ? "too_large" : "bad_request" });
      return reply(res, status, { connection: "close" });
    }

    const contentType = req.headers["content-type"];
    const result = relay.accept(tenantId, body, contentType);
    // The body is deliberately not logged: payloads carry customers' API keys and tokens.
    const meta = { tenant: tenantId, bytes: body.length, contentType };
    switch (result.status) {
      case "accepted":
        log("webhook_accepted", { ...meta, webhookId: result.id });
        return reply(res, 202, { "x-webhook-id": result.id });
      case "rate_limited":
        log("webhook_rejected", { ...meta, reason: "rate_limited" });
        return reply(res, 429, { "retry-after": String(result.retryAfterSec) });
      case "overloaded":
        log("webhook_rejected", { ...meta, reason: "overloaded" });
        return reply(res, 503, { "retry-after": String(result.retryAfterSec) });
      case "unknown_tenant":
        return reply(res, 404);
    }
  });
}
