import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { TenantConfig } from './config.js';
import { Relay, type RelayDependencies } from './relay.js';

export interface IncomingLog {
  type: 'incoming';
  method: string | undefined;
  path: string | undefined;
  tenantId?: string;
  contentType?: string;
  bodyBase64: string;
  bodyComplete: boolean;
  status: number;
  webhookId?: string;
}

export interface ServerOptions {
  relayDependencies?: Partial<RelayDependencies>;
  logIncoming?: (entry: IncomingLog) => void;
}

function tenantFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  let pathname: string;
  try {
    pathname = new URL(path, 'http://localhost').pathname;
  } catch {
    return undefined;
  }
  const match = /^\/webhooks\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse, relay: Relay, log: (entry: IncomingLog) => void): Promise<void> {
  const chunks: Buffer[] = [];
  let complete = false;
  try {
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    complete = true;
  } catch {
    // Log the bytes received before a client disconnects.
  }

  const body = Buffer.concat(chunks);
  const tenantId = tenantFromPath(req.url);
  const contentType = req.headers['content-type'];
  let status = 404;
  let retryAfter: number | undefined;
  let webhookId: string | undefined;

  if (!complete) {
    status = 400;
  } else if (req.method === 'POST' && tenantId !== undefined) {
    const result = relay.accept(tenantId, body, contentType);
    if (result.kind === 'accepted') {
      status = 202;
      webhookId = result.id;
    } else if (result.kind === 'limited') {
      status = 429;
      retryAfter = result.retryAfter;
    }
  }

  log({
    type: 'incoming', method: req.method, path: req.url, tenantId, contentType,
    bodyBase64: body.toString('base64'), bodyComplete: complete, status, webhookId,
  });
  if (res.destroyed) return;
  if (retryAfter !== undefined) res.setHeader('Retry-After', String(retryAfter));
  if (webhookId !== undefined) res.setHeader('X-Webhook-Id', webhookId);
  res.writeHead(status);
  res.end();
}

export function createWebhookServer(tenants: Map<string, TenantConfig>, options: ServerOptions = {}): Server {
  const relay = new Relay(tenants, options.relayDependencies);
  const log = options.logIncoming ?? ((entry: IncomingLog) => console.log(JSON.stringify(entry)));
  return createServer((req, res) => {
    void handle(req, res, relay, log).catch((error: unknown) => {
      console.error('Request handler failed', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}
