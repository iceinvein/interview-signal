import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { HttpApp } from "./app.ts";
import type { Method } from "./types.ts";

const METHODS: readonly Method[] = ["GET", "POST", "PATCH", "DELETE"];
const MAX_BODY_BYTES = 64 * 1024;

// Adapts the in-process HttpApp to node:http. Everything interesting happens
// in the app; this file only moves bytes.
export function createNodeServer(app: HttpApp): Server {
  return createServer(async (req, res) => {
    const method = METHODS.find((m) => m === req.method);
    if (!method) {
      send(res, 405, { error: { code: "method_not_allowed", message: `${req.method} is not supported` } });
      return;
    }
    const body = await readJson(req);
    if (body === INVALID) {
      send(res, 400, { error: { code: "validation", field: "body", message: "request body is not valid JSON" } });
      return;
    }
    const response = app.handle({ method, path: req.url ?? "/", body });
    send(res, response.status, response.body);
  });
}

const INVALID = Symbol("invalid");

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return INVALID;
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return INVALID;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
