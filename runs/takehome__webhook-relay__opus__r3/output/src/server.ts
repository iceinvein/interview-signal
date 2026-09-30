import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Logger } from "./logger.ts";
import type { Relay } from "./relay.ts";

export interface ServerOptions {
  relay: Relay;
  logger: Logger;
  maxBodyBytes: number;
}

const ROUTE = /^\/webhooks\/([^/]+)\/?$/;

type LogFields = Record<string, string | number | undefined>;

export function createRelayServer(opts: ServerOptions): Server {
  return createServer((req, res) => {
    const started = performance.now();
    // Filled in by the handler as it learns things; emitted as one access log line.
    const fields: LogFields = {};
    handle(req, res, opts, fields)
      .catch((err: Error) => {
        opts.logger.error("unhandled error", { ...fields, error: err.message });
        if (!res.headersSent) reply(res, 500, { error: "internal error" });
      })
      .finally(() => {
        opts.logger.info("request", {
          method: req.method,
          path: req.url,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
          ...fields,
        });
      });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  { relay, maxBodyBytes }: ServerOptions,
  fields: LogFields,
): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const match = ROUTE.exec(path);
  if (!match) return reply(res, 404, { error: "not found" });

  let tenantId: string;
  try {
    tenantId = decodeURIComponent(match[1]!);
  } catch {
    return reply(res, 404, { error: "not found" });
  }
  fields.tenantId = tenantId;

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return reply(res, 405, { error: "method not allowed" });
  }
  // Reject unknown tenants before reading (possibly large) bodies.
  if (!relay.hasTenant(tenantId)) return reply(res, 404, { error: "unknown tenant" });

  const body = await readBody(req, maxBodyBytes);
  if (body === undefined) {
    res.setHeader("connection", "close");
    return reply(res, 413, { error: `body exceeds ${maxBodyBytes} bytes` });
  }

  const contentType = req.headers["content-type"];
  // Log a fingerprint of the body rather than the body: payloads carry tenants'
  // customers' credentials. The hash lets on-call match a log line to a payload
  // the tenant or destination shows them. See README "Logging".
  Object.assign(fields, {
    contentType,
    bodyBytes: body.length,
    bodySha256: createHash("sha256").update(body).digest("hex"),
  });

  const result = relay.accept(tenantId, body, contentType);
  switch (result.kind) {
    case "accepted":
      fields.webhookId = result.webhookId;
      res.setHeader("x-webhook-id", result.webhookId);
      return reply(res, 202, { id: result.webhookId });
    case "unknown_tenant":
      return reply(res, 404, { error: "unknown tenant" });
    case "rate_limited":
      res.setHeader("retry-after", String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
      return reply(res, 429, { error: "rate limit exceeded" });
    case "backlog_full":
      res.setHeader("retry-after", "1");
      return reply(res, 503, { error: "delivery backlog full" });
  }
}

/** Resolves to the body, or undefined if it exceeds `limit` bytes. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        req.removeAllListeners("end");
        resolve(undefined);
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
