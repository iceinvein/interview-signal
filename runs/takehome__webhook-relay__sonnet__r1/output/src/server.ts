import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Logger } from "./logger.ts";
import type { Relay } from "./relay.ts";

export interface ServerOptions {
  relay: Relay;
  logger: Logger;
  maxBodyBytes?: number;
}

const ROUTE = /^\/webhooks\/([^/]+)$/;

export function createRelayServer({ relay, logger, maxBodyBytes = 1024 * 1024 }: ServerOptions): Server {
  return createServer((req, res) => {
    handle(req, res).catch((err) => {
      logger.error("request failed", { err: String(err) });
      if (!res.headersSent) respond(res, 500, { error: "internal error" });
      else res.destroy();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "").split("?")[0]!;
    const tenantId = safeDecode(ROUTE.exec(path)?.[1]);
    const contentType = req.headers["content-type"];
    // Deliberately no body in the log: payloads carry customers' API keys and tokens.
    const logBase = { method: req.method, path: tenantId === undefined ? path : `/webhooks/${tenantId}`, contentType };
    const done = (status: number, extra: Record<string, unknown> = {}) =>
      logger.info("request", { ...logBase, status, ...extra });

    if (tenantId === undefined) {
      respond(res, 404, { error: "not found" });
      return done(404);
    }
    if (req.method !== "POST") {
      respond(res, 405, { error: "method not allowed" }, { Allow: "POST" });
      return done(405);
    }
    // Reject unknown tenants before reading the body.
    if (!relay.hasTenant(tenantId)) {
      rejectEarly(req, res, 404, { error: "unknown tenant" });
      return done(404);
    }

    const body = await readBody(req, maxBodyBytes);
    if (body === undefined) {
      rejectEarly(req, res, 413, { error: "payload too large" });
      return done(413);
    }

    const result = relay.accept(tenantId, { body, contentType });
    switch (result.kind) {
      case "accepted":
        respond(res, 202, { id: result.id });
        return done(202, { webhookId: result.id, bytes: body.length });
      case "rate-limited":
        respond(res, 429, { error: "rate limit exceeded" }, { "Retry-After": String(result.retryAfterSec) });
        return done(429, { bytes: body.length });
      case "overloaded":
        respond(res, 503, { error: "too many undelivered webhooks" }, { "Retry-After": String(result.retryAfterSec) });
        return done(503, { bytes: body.length });
      case "unknown-tenant":
        respond(res, 404, { error: "unknown tenant" });
        return done(404);
    }
  }
}

/** Resolves undefined if the body exceeds `limit`. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const declared = Number(req.headers["content-length"]);
  if (declared > limit) return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        chunks.length = 0;
        resolve(undefined);
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Reply without consuming the request body, then close so we don't read an unbounded upload. */
function rejectEarly(req: IncomingMessage, res: ServerResponse, status: number, body: object): void {
  respond(res, status, body, { Connection: "close" });
  res.once("finish", () => req.destroy());
}

function respond(res: ServerResponse, status: number, body: object, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers });
  res.end(payload);
}

function safeDecode(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}
