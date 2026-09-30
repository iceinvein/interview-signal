import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { parseTenants, type Tenants } from './config.js';
import { createRelay, type LogRecord } from './relay.js';

const tenants: Tenants = {
  acme: { destination: 'https://acme.example/hook', maxAttempts: 3, initialBackoffMs: 10, requestsPerSecond: 2 },
  beta: { destination: 'https://beta.example/hook', maxAttempts: 2, initialBackoffMs: 20, requestsPerSecond: 1 },
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 1));
  }
  assert.fail('condition was not reached');
}

test('accepts opaque bytes, logs the full body, and forwards without waiting for delivery', async () => {
  const records: LogRecord[] = [];
  const forwarded: Array<{ url: string; init: RequestInit }> = [];
  let finishDelivery!: (value: Response) => void;
  const delivery = new Promise<Response>(resolve => { finishDelivery = resolve; });
  const server = createRelay(tenants, {
    id: () => 'event-1',
    log: record => records.push(record),
    fetch: (async (url, init) => {
      forwarded.push({ url: String(url), init: init! });
      return delivery;
    }) as typeof fetch,
  });
  const base = await listen(server);
  const bytes = Buffer.from([0, 255, 1, 65]);
  const response = await fetch(`${base}/webhooks/acme`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
  });

  assert.equal(response.status, 202);
  await waitUntil(() => forwarded.length === 1);
  assert.equal(forwarded[0].url, tenants.acme.destination);
  assert.deepEqual(Buffer.from(forwarded[0].init.body as Uint8Array), bytes);
  assert.equal((forwarded[0].init.headers as Record<string, string>)['Content-Type'], 'application/octet-stream');
  assert.equal((forwarded[0].init.headers as Record<string, string>)['X-Webhook-Id'], 'event-1');
  assert.equal(records[0].kind, 'request');
  assert.equal(records[0].bodyBase64, bytes.toString('base64'));
  finishDelivery(new Response(null, { status: 204 }));
  await waitUntil(() => records.some(record => record.kind === 'delivery'));
  assert.equal(records[1].delivered, true);
});

test('forwards bytes and content type over HTTP to a real destination', async () => {
  const received: Array<{ body: Buffer; contentType: string | string[] | undefined; id: string | string[] | undefined }> = [];
  const destination = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.push({
        body: Buffer.concat(chunks),
        contentType: request.headers['content-type'],
        id: request.headers['x-webhook-id'],
      });
      response.writeHead(204).end();
    })();
  });
  const destinationUrl = await listen(destination);
  const relay = createRelay({
    acme: { ...tenants.acme, destination: destinationUrl },
  }, { log: () => {}, id: () => 'end-to-end-id' });
  const base = await listen(relay);
  const bytes = Buffer.from([0, 1, 2, 255]);

  const response = await fetch(`${base}/webhooks/acme`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-custom; version=2' }, body: bytes,
  });
  assert.equal(response.status, 202);
  await waitUntil(() => received.length === 1);
  assert.deepEqual(received[0], {
    body: bytes, contentType: 'application/x-custom; version=2', id: 'end-to-end-id',
  });

  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(`${base}/webhooks/acme`, { method: 'POST' }, response => {
      assert.equal(response.statusCode, 202);
      response.resume();
      response.on('end', resolve);
    });
    request.on('error', reject);
    request.end(bytes);
  });
  await waitUntil(() => received.length === 2);
  assert.deepEqual(received[1], { body: bytes, contentType: undefined, id: 'end-to-end-id' });
});

test('uses a rolling per-tenant limit and rejects unknown tenants without forwarding', async () => {
  let now = 0;
  const forwarded: string[] = [];
  const records: LogRecord[] = [];
  const server = createRelay(tenants, {
    now: () => now, log: record => records.push(record),
    fetch: (async url => {
      forwarded.push(String(url));
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  const base = await listen(server);
  const post = (tenant: string) => fetch(`${base}/webhooks/${tenant}`, { method: 'POST', body: 'x' });

  now = 900;
  assert.equal((await post('acme')).status, 202);
  now = 999;
  assert.equal((await post('acme')).status, 202);
  now = 1000;
  const limited = await post('acme');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '1');
  assert.equal((await post('beta')).status, 202);
  assert.equal((await post('unknown')).status, 404);
  now = 1899;
  assert.equal((await post('acme')).status, 429);
  now = 1900;
  assert.equal((await post('acme')).status, 202);
  await waitUntil(() => forwarded.length === 4);
  assert.deepEqual(forwarded.filter(url => url === tenants.acme.destination).length, 3);
  assert.equal(records.filter(record => record.kind === 'request').length, 7);
});

test('retries failures with exponential delays and preserves the webhook ID', async () => {
  const waits: Array<{ ms: number; release: () => void }> = [];
  const calls: RequestInit[] = [];
  const responses: Array<() => Promise<Response>> = [
    async () => new Response(null, { status: 503 }),
    async () => { throw new Error('connection refused'); },
    async () => new Response(null, { status: 201 }),
  ];
  const logs: LogRecord[] = [];
  const server = createRelay(tenants, {
    id: () => 'stable-id', log: record => logs.push(record),
    sleep: ms => new Promise(resolve => waits.push({ ms, release: resolve })),
    fetch: (async (_url, init) => {
      calls.push(init!);
      return responses[calls.length - 1]();
    }) as typeof fetch,
  });
  const base = await listen(server);
  assert.equal((await fetch(`${base}/webhooks/acme`, { method: 'POST', body: 'payload' })).status, 202);
  await waitUntil(() => waits.length === 1);
  assert.equal(waits[0].ms, 10);
  assert.equal(calls.length, 1);
  waits[0].release();
  await waitUntil(() => waits.length === 2);
  assert.equal(waits[1].ms, 20);
  waits[1].release();
  await waitUntil(() => logs.filter(log => log.kind === 'delivery').length === 3);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => (call.headers as Record<string, string>)['X-Webhook-Id']), ['stable-id', 'stable-id', 'stable-id']);
  assert.deepEqual(logs.filter(log => log.kind === 'delivery').map(log => log.delivered), [false, false, true]);
});

test('a slow tenant does not hold up another tenant and stops at maxAttempts', async () => {
  const calls: string[] = [];
  let release!: (value: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const server = createRelay(tenants, {
    sleep: async () => {},
    log: () => {},
    fetch: (async url => {
      calls.push(String(url));
      if (url === tenants.acme.destination) return held;
      return new Response(null, { status: 500 });
    }) as typeof fetch,
  });
  const base = await listen(server);
  assert.equal((await fetch(`${base}/webhooks/acme`, { method: 'POST' })).status, 202);
  assert.equal((await fetch(`${base}/webhooks/beta`, { method: 'POST' })).status, 202);
  await waitUntil(() => calls.filter(url => url === tenants.beta.destination).length === 2);
  assert.equal(calls.filter(url => url === tenants.acme.destination).length, 1);
  release(new Response(null, { status: 200 }));
});

test('validates tenant configuration at startup', () => {
  assert.deepEqual(Object.keys(parseTenants({ tenants: {} })), []);
  assert.throws(() => parseTenants({ tenants: { a: { ...tenants.acme, requestsPerSecond: 0 } } }), /requestsPerSecond/);
  assert.throws(() => parseTenants({ tenants: { a: { ...tenants.acme, destination: 'file:\/\/secret' } } }), /destination/);
  assert.throws(() => parseTenants({ tenants: { a: { ...tenants.acme, maxAttempts: 1.5 } } }), /maxAttempts/);
});
