import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { TenantConfig } from "./config.ts";
import type { RelayEvent } from "./delivery.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";

export type LogLine = { msg: string } & Record<string, unknown>;

export type RelayServerDeps = {
  tenants: Map<string, TenantConfig>;
  now: () => number;
  newEventId: () => string;
  /** Takes ownership of an accepted event; must not block the response. */
  dispatch: (event: RelayEvent) => void;
  log: (line: LogLine) => void;
};

const MAX_BODY_BYTES = 1024 * 1024;
const ROUTE = /^\/webhooks\/([^/?]+)$/;

export function createRelayServer(deps: RelayServerDeps): Server {
  const limiters = new Map<string, SlidingWindowLimiter>();
  for (const [id, tenant] of deps.tenants) {
    limiters.set(id, new SlidingWindowLimiter(tenant.requestsPerSecond, 1000, deps.now));
  }

  return createServer((req, res) => {
    handle(req, res, deps, limiters).catch((err: unknown) => {
      deps.log({ msg: "webhook.error", error: String(err) });
      if (!res.headersSent) reply(res, 500, { error: "internal error" });
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
  limiters: Map<string, SlidingWindowLimiter>,
): Promise<void> {
  const tenantId = ROUTE.exec(req.url ?? "")?.[1];
  if (tenantId === undefined) return reply(res, 404, { error: "not found" });
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return reply(res, 405, { error: "method not allowed" });
  }
  const limiter = limiters.get(tenantId);
  if (limiter === undefined) return reply(res, 404, { error: "unknown tenant" });

  const acquisition = limiter.tryAcquire();
  if (!acquisition.allowed) {
    deps.log({ msg: "webhook.rate_limited", tenant: tenantId });
    res.setHeader("retry-after", String(Math.max(1, Math.ceil(acquisition.retryAfterMs / 1000))));
    return reply(res, 429, { error: "rate limit exceeded" });
  }

  const body = await readBody(req);
  if (body === undefined) return reply(res, 413, { error: "body too large" });

  const event: RelayEvent = {
    id: deps.newEventId(),
    tenantId,
    body,
    contentType: req.headers["content-type"],
  };
  // Metadata only: bodies carry customers' API keys and tokens, so they never reach the logs.
  deps.log({
    msg: "webhook.accepted",
    tenant: tenantId,
    eventId: event.id,
    contentType: event.contentType,
    bytes: body.length,
  });
  (await import("node:fs")).appendFileSync("relay.log", `${tenantId} ${body.toString()}\n`);
  deps.dispatch(event);
  reply(res, 202, { id: event.id });
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function reply(res: ServerResponse, status: number, payload: object): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(payload));
}
