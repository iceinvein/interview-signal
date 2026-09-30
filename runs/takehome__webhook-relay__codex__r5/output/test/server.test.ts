import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import { createWebhookServer, type IncomingLog } from '../src/server.js';
import type { TenantConfig } from '../src/config.js';

const tenant: TenantConfig = {
  destination: 'http://127.0.0.1/', maxAttempts: 1,
  initialBackoffMs: 100, requestsPerSecond: 1,
};

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('accepts opaque bytes, forwards Content-Type and stable ID, and responds before delivery', async () => {
  const release = deferred<void>();
  const received = deferred<{ body: Buffer; contentType: string | undefined; id: string | undefined }>();
  const destination = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const idHeader = req.headers['x-webhook-id'];
    received.resolve({ body: Buffer.concat(chunks), contentType: req.headers['content-type'], id: Array.isArray(idHeader) ? idHeader[0] : idHeader });
    await release.promise;
    res.writeHead(204);
    res.end();
  });
  const destinationUrl = await listen(destination);
  const logs: IncomingLog[] = [];
  const relay = createWebhookServer(new Map([['acme', { ...tenant, destination: destinationUrl }]]), {
    logIncoming: (entry) => { logs.push(entry); },
    relayDependencies: { report: () => {} },
  });
  const relayUrl = await listen(relay);
  try {
    const body = Buffer.from([0, 255, 13, 10, 123]);
    const response = await fetch(`${relayUrl}/webhooks/acme`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-custom; key=value' }, body,
    });
    assert.equal(response.status, 202);
    const request = await received.promise;
    assert.deepEqual(request.body, body);
    assert.equal(request.contentType, 'application/x-custom; key=value');
    assert.equal(request.id, response.headers.get('x-webhook-id'));
    assert.match(request.id!, /^[0-9a-f-]{36}$/);
    assert.equal(logs[0]?.bodyBase64, body.toString('base64'));
    assert.equal(logs[0]?.bodyComplete, true);
    assert.equal(logs[0]?.webhookId, request.id);
  } finally {
    release.resolve();
    await close(relay);
    await close(destination);
  }
});

test('unknown tenants and limited requests are logged and never forwarded', async () => {
  let now = 0;
  let delivered = 0;
  const logs: IncomingLog[] = [];
  const relay = createWebhookServer(new Map([['acme', tenant]]), {
    logIncoming: (entry) => { logs.push(entry); },
    relayDependencies: {
      now: () => now,
      deliver: async () => { delivered++; return 204; },
      report: () => {},
    },
  });
  const url = await listen(relay);
  try {
    const unknown = await fetch(`${url}/webhooks/missing`, { method: 'POST', body: 'secret A' });
    assert.equal(unknown.status, 404);
    const first = await fetch(`${url}/webhooks/acme`, { method: 'POST', body: 'secret B' });
    assert.equal(first.status, 202);
    const limited = await fetch(`${url}/webhooks/acme`, { method: 'POST', body: 'secret C' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '1');
    now = 1000;
    const next = await fetch(`${url}/webhooks/acme`, { method: 'POST', body: 'secret D' });
    assert.equal(next.status, 202);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(delivered, 2);
    assert.deepEqual(logs.map((entry) => entry.status), [404, 202, 429, 202]);
    assert.deepEqual(logs.map((entry) => Buffer.from(entry.bodyBase64, 'base64').toString()),
      ['secret A', 'secret B', 'secret C', 'secret D']);
  } finally {
    await close(relay);
  }
});
