import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { Server, createServer } from 'node:http';
import { afterEach, test } from 'node:test';
import { parseTenants, TenantConfig } from '../config';
import { createRelay, LogEntry } from '../relay';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

const base: TenantConfig = {
  destination: 'https://example.test/hook', maxAttempts: 3,
  initialBackoffMs: 100, requestsPerSecond: 2,
};

async function start(config: Record<string, TenantConfig>, dependencies: Parameters<typeof createRelay>[1] = {}) {
  const server = createRelay(new Map(Object.entries(config)), dependencies);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function post(baseUrl: string, tenant: string, body: Uint8Array, contentType = 'application/octet-stream') {
  return fetch(`${baseUrl}/webhooks/${tenant}`, {
    method: 'POST', body: new Uint8Array(body), headers: { 'Content-Type': contentType },
  });
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.fail('condition was not reached');
}

test('accepts opaque bytes, preserves Content-Type, returns an ID, and logs full input', async () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const logs: LogEntry[] = [];
  const url = await start({ acme: base }, {
    id: () => 'fixed-id',
    log: entry => logs.push(entry),
    fetch: (async (destination, options) => {
      calls.push({ url: String(destination), options: options! });
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  });
  const body = Uint8Array.from([0, 255, 1, 35, 10]);
  const response = await post(url, 'acme', body, 'application/x-custom; charset=binary');
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('x-webhook-id'), 'fixed-id');
  await until(() => calls.length === 1);
  assert.equal(calls[0]!.url, base.destination);
  assert.equal(calls[0]!.options.method, 'POST');
  assert.deepEqual(Buffer.from(calls[0]!.options.body as Uint8Array), Buffer.from(body));
  assert.deepEqual(calls[0]!.options.headers, {
    'X-Webhook-Id': 'fixed-id', 'Content-Type': 'application/x-custom; charset=binary',
  });
  const incoming = logs.find(entry => entry.kind === 'incoming');
  assert.equal(incoming?.bodyBase64, Buffer.from(body).toString('base64'));
  assert.equal(incoming?.status, 202);
});

test('forwards to a real HTTP destination with exact bytes and headers', async () => {
  let received!: (value: { body: Buffer; contentType: string | undefined; id: string | undefined }) => void;
  const delivered = new Promise<{ body: Buffer; contentType: string | undefined; id: string | undefined }>(resolve => { received = resolve; });
  const destination = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const headerId = request.headers['x-webhook-id'];
    received({ body: Buffer.concat(chunks), contentType: request.headers['content-type'], id: Array.isArray(headerId) ? headerId[0] : headerId });
    response.writeHead(204).end();
  });
  servers.push(destination);
  destination.listen(0, '127.0.0.1');
  await once(destination, 'listening');
  const destinationUrl = `http://127.0.0.1:${(destination.address() as AddressInfo).port}/hook`;
  const relay = await start({ acme: { ...base, destination: destinationUrl } }, { log: () => {} });
  const body = Uint8Array.of(0, 128, 255);
  const response = await post(relay, 'acme', body, 'application/example');
  assert.equal(response.status, 202);
  const actual = await delivered;
  assert.deepEqual(actual.body, Buffer.from(body));
  assert.equal(actual.contentType, 'application/example');
  assert.equal(actual.id, response.headers.get('x-webhook-id'));
});

test('retries non-2xx and connection errors with exponential delays and the same ID', async () => {
  const delays: Array<{ ms: number; resolve: () => void }> = [];
  const ids: string[] = [];
  let attempts = 0;
  const url = await start({ acme: base }, {
    id: () => 'event-1',
    sleep: ms => new Promise<void>(resolve => delays.push({ ms, resolve })),
    fetch: (async (_destination, options) => {
      ids.push((options!.headers as Record<string, string>)['X-Webhook-Id']!);
      attempts++;
      if (attempts === 1) return new Response(null, { status: 500 });
      if (attempts === 2) throw new Error('connection lost');
      return new Response(null, { status: 201 });
    }) as typeof fetch,
    log: () => {},
  });
  assert.equal((await post(url, 'acme', Uint8Array.of(3))).status, 202);
  await until(() => delays.length === 1);
  assert.equal(attempts, 1);
  assert.equal(delays[0]!.ms, 100);
  delays[0]!.resolve();
  await until(() => delays.length === 2);
  assert.equal(attempts, 2);
  assert.equal(delays[1]!.ms, 200);
  delays[1]!.resolve();
  await until(() => attempts === 3);
  assert.deepEqual(ids, ['event-1', 'event-1', 'event-1']);
  assert.equal(delays.length, 2);
});

test('stops after maxAttempts, including the first try', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const url = await start({ acme: { ...base, maxAttempts: 2 } }, {
    fetch: (async () => { attempts++; return new Response(null, { status: 429 }); }) as typeof fetch,
    sleep: async ms => { delays.push(ms); },
    log: () => {},
  });
  assert.equal((await post(url, 'acme', Uint8Array.of(1))).status, 202);
  await until(() => attempts === 2);
  assert.deepEqual(delays, [100]);
});

test('uses a rolling per-tenant second and rejects only the tenant over its limit', async () => {
  let time = 0;
  let forwarded = 0;
  const logs: LogEntry[] = [];
  const url = await start({ acme: base, beta: { ...base, destination: 'https://beta.test/hook' } }, {
    now: () => time,
    fetch: (async () => { forwarded++; return new Response(null, { status: 204 }); }) as typeof fetch,
    log: entry => logs.push(entry),
  });
  assert.equal((await post(url, 'acme', Uint8Array.of(1))).status, 202);
  time = 500;
  assert.equal((await post(url, 'acme', Uint8Array.of(2))).status, 202);
  time = 999;
  const limited = await post(url, 'acme', Uint8Array.of(3));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal((await post(url, 'beta', Uint8Array.of(4))).status, 202);
  time = 1000;
  assert.equal((await post(url, 'acme', Uint8Array.of(5))).status, 202);
  time = 1499;
  assert.equal((await post(url, 'acme', Uint8Array.of(6))).status, 429);
  time = 1500;
  assert.equal((await post(url, 'acme', Uint8Array.of(7))).status, 202);
  await until(() => forwarded === 5);
  assert.equal(logs.find(entry => entry.kind === 'incoming' && entry.status === 429)?.bodyBase64,
    Buffer.from([3]).toString('base64'));
});

test('a hanging tenant delivery does not delay another tenant', async () => {
  let slowStarted = false;
  let fastDelivered = false;
  let releaseSlow!: (response: Response) => void;
  const slow = new Promise<Response>(resolve => { releaseSlow = resolve; });
  const url = await start({ acme: base, beta: { ...base, destination: 'https://beta.test/hook' } }, {
    fetch: (async destination => {
      if (String(destination) === base.destination) { slowStarted = true; return slow; }
      fastDelivered = true;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
    log: () => {},
  });
  assert.equal((await post(url, 'acme', Uint8Array.of(1))).status, 202);
  await until(() => slowStarted);
  assert.equal((await post(url, 'beta', Uint8Array.of(2))).status, 202);
  await until(() => fastDelivered);
  releaseSlow(new Response(null, { status: 204 }));
});

test('unknown tenants return 404 and are logged without delivery', async () => {
  const logs: LogEntry[] = [];
  let forwarded = false;
  const url = await start({ acme: base }, {
    fetch: (async () => { forwarded = true; return new Response(null, { status: 204 }); }) as typeof fetch,
    log: entry => logs.push(entry),
  });
  assert.equal((await post(url, 'missing', Uint8Array.of(9))).status, 404);
  assert.equal(forwarded, false);
  assert.equal(logs.find(entry => entry.kind === 'incoming')?.bodyBase64, 'CQ==');
});

test('configuration rejects unusable retry and destination settings', () => {
  assert.throws(() => parseTenants({ tenants: { bad: { ...base, maxAttempts: 0 } } }), /maxAttempts/);
  assert.throws(() => parseTenants({ tenants: { bad: { ...base, destination: 'file:\/\/test' } } }), /HTTP\(S\)/);
  assert.throws(() => parseTenants({ tenants: { bad: { ...base, initialBackoffMs: 2e15, maxAttempts: 5 } } }), /safe integer range/);
});
