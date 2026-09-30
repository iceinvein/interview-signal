import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Relay, type DeliveryLog } from './relay.js';

function getTenantId(pathname: string): string | undefined {
  const match = /^\/webhooks\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
}

export function createRelayServer(relay: Relay, log: DeliveryLog): Server {
  return createServer((request, response) => {
    void handle(request, response, relay, log).catch(error => {
      log({ type: 'server_error', error: error instanceof Error ? error.message : String(error) });
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
}

async function handle(request: IncomingMessage, response: ServerResponse, relay: Relay, log: DeliveryLog): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const tenantId = getTenantId(pathname);
  const contentType = request.headers['content-type'];
  const incoming = {
    type: 'incoming',
    method: request.method,
    path: request.url,
    tenantId,
    contentType,
    bodyBase64: body.toString('base64'),
  };

  if (request.method !== 'POST' || tenantId === undefined) {
    log({ ...incoming, status: 404 });
    response.writeHead(404).end();
    return;
  }

  const result = relay.accept(tenantId, body, contentType);
  switch (result.kind) {
    case 'unknown':
      log({ ...incoming, status: 404 });
      response.writeHead(404).end();
      break;
    case 'limited':
      log({ ...incoming, status: 429 });
      response.writeHead(429, { 'Retry-After': String(result.retryAfterSeconds) }).end();
      break;
    case 'accepted':
      log({ ...incoming, status: 202, webhookId: result.id });
      response.writeHead(202, { 'X-Webhook-Id': result.id }).end();
      break;
  }
}
