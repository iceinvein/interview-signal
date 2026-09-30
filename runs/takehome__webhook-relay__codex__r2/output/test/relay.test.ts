import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, test } from 'node:test';
import { parseTenants, type Tenants } from '../src/config.js';
import { createRelay } from '../src/relay.js';
import { postWebhook } from '../src/transport.js';
import type { Webhook } from '../src/delivery.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}

function tenants(): Tenants {
  return {
    acme: { destination: 'http://example.test/acme', maxAttempts: 4, initialBackoffMs: 100,
      requestsPerSecond: 2 },
    beta: { destination: 'http://example.test/beta', maxAttempts: 1, initialBackoffMs: 0,
      requestsPerSecond: 1 },
  };
}

async function eventually(predicate: () => boolean): Promise<void> {
  const end = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Expected condition was not reached');
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

test('forwards opaque bytes and the original Content-Type with an event id', async () => {
  const deliveries: { body: Buffer; contentType: string | undefined; id: string | undefined }[] = [];
  const destination = await listen(createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
    const id = request.headers['x-webhook-id'];
    deliveries.push({ body: Buffer.concat(chunks), contentType: request.headers['content-type'],
      id: Array.isArray(id) ? id[0] : id });
    response.writeHead(204).end();
  }));
  const config = tenants();
  config.acme!.destination = `${destination}/relay`;
  const logs: Record<string, unknown>[] = [];
  const relay = await listen(createRelay(config, { log: (record) => logs.push(record), newId: () => 'event-123' }));
  const body = Buffer.from([0, 255, 1, 128, 42]);
  const response = await fetch(`${relay}/webhooks/acme`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-custom; charset=binary' },
    body: new Uint8Array(body),
  });

  assert.equal(response.status, 202);
  await eventually(() => deliveries.length === 1);
  assert.deepEqual(deliveries[0]!.body, body);
  assert.equal(deliveries[0]!.contentType, 'application/x-custom; charset=binary');
  assert.equal(deliveries[0]!.id, 'event-123');
  const incoming = logs.find((record) => record.event === 'incoming_request');
  assert.equal(incoming?.bodyBase64, body.toString('base64'));
});

test('retries failed attempts at exact exponential delays with the same id and stops on 2xx', async () => {
  const calls: Webhook[] = [];
  const waits: number[] = [];
  const statuses = [503, 302, -1, 201];
  const relay = await listen(createRelay(tenants(), {
    newId: () => 'same-id', log: () => {},
    post: async (_destination, webhook) => {
      calls.push(webhook);
      const status = statuses[calls.length - 1]!;
      if (status === -1) throw new Error('connection reset');
      return status;
    },
    wait: async (ms) => { waits.push(ms); },
  }));
  const response = await fetch(`${relay}/webhooks/acme`, { method: 'POST', body: 'hello' });
  assert.equal(response.status, 202);
  await eventually(() => calls.length === 4);
  assert.deepEqual(waits, [100, 200, 400]);
  assert.deepEqual(calls.map((call) => call.id), ['same-id', 'same-id', 'same-id', 'same-id']);
  assert.deepEqual(calls.map((call) => call.body.toString()), ['hello', 'hello', 'hello', 'hello']);
});

test('maxAttempts includes the first try and exhaustion makes no extra retry', async () => {
  let calls = 0;
  const waits: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const config = tenants();
  config.acme!.maxAttempts = 3;
  const relay = await listen(createRelay(config, {
    log: (record) => logs.push(record),
    post: async () => { calls++; return 500; },
    wait: async (ms) => { waits.push(ms); },
  }));
  assert.equal((await fetch(`${relay}/webhooks/acme`, { method: 'POST' })).status, 202);
  await eventually(() => logs.some((record) => record.event === 'delivery_exhausted'));
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 200]);
});

test('rolling per-tenant rate limit rejects excess requests and resets after one second', async () => {
  let now = 0;
  const delivered: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const relay = await listen(createRelay(tenants(), {
    now: () => now, log: (record) => logs.push(record),
    post: async (_destination, webhook) => { delivered.push(webhook.tenantId); return 200; },
  }));
  const send = (id: string, body: string) => fetch(`${relay}/webhooks/${id}`, { method: 'POST', body });
  assert.equal((await send('acme', 'a')).status, 202);
  now = 500;
  assert.equal((await send('acme', 'b')).status, 202);
  now = 999;
  const limited = await send('acme', 'c');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal((await send('beta', 'd')).status, 202);
  now = 1000;
  assert.equal((await send('acme', 'e')).status, 202);
  assert.equal((await send('missing', 'secret')).status, 404);
  await eventually(() => delivered.length === 4);
  assert.deepEqual(delivered.sort(), ['acme', 'acme', 'acme', 'beta']);
  assert.equal(logs.filter((record) => record.event === 'incoming_request').length, 6);
  assert.equal(logs.find((record) => record.status === 429)?.bodyBase64, Buffer.from('c').toString('base64'));
  assert.equal(logs.find((record) => record.status === 404)?.bodyBase64, Buffer.from('secret').toString('base64'));
});

test('a slow tenant does not delay another tenant or its HTTP acceptance', async () => {
  let releaseSlow!: () => void;
  const slow = new Promise<number>((resolve) => { releaseSlow = () => resolve(200); });
  const delivered: string[] = [];
  const relay = await listen(createRelay(tenants(), {
    log: () => {}, post: async (_destination, webhook) => {
      if (webhook.tenantId === 'acme') return slow;
      delivered.push(webhook.tenantId);
      return 200;
    },
  }));
  try {
    assert.equal((await fetch(`${relay}/webhooks/acme`, { method: 'POST' })).status, 202);
    assert.equal((await fetch(`${relay}/webhooks/acme`, { method: 'POST' })).status, 202);
    assert.equal((await fetch(`${relay}/webhooks/beta`, { method: 'POST' })).status, 202);
    await eventually(() => delivered.includes('beta'));
  } finally {
    releaseSlow();
  }
});

test('transport treats redirects as failures and sends no Content-Type when absent', async () => {
  const received: Array<string | undefined> = [];
  const destination = await listen(createServer((request, response) => {
    received.push(request.headers['content-type']);
    response.writeHead(302, { Location: '/other' }).end();
  }));
  const status = await postWebhook(destination, {
    id: 'id', tenantId: 'acme', body: Buffer.from([1, 2, 3]),
  });
  assert.equal(status, 302);
  assert.deepEqual(received, [undefined]);
});

test('validates tenant configuration before listening', () => {
  assert.deepEqual(Object.keys(parseTenants({ tenants: tenants() })).sort(), ['acme', 'beta']);
  assert.throws(() => parseTenants({ tenants: { acme: { ...tenants().acme, maxAttempts: 0 } } }));
  assert.throws(() => parseTenants({ tenants: { acme: { ...tenants().acme, requestsPerSecond: 0 } } }));
  assert.throws(() => parseTenants({ tenants: { acme: { ...tenants().acme, destination: 'file:///tmp/a' } } }));
});
