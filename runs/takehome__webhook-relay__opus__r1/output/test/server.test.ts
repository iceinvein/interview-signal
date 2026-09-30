import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type { TenantConfig } from '../src/config.ts';
import type { Sender } from '../src/delivery.ts';
import type { LogFields, Logger } from '../src/log.ts';
import { createRelayServer, createTenants } from '../src/server.ts';
import { FakeClock, never, recordingSender } from './helpers.ts';

const base: TenantConfig = {
  destination: 'https://dest.example/hook',
  maxAttempts: 3,
  initialBackoffMs: 1000,
  requestsPerSecond: 2,
};

const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function startRelay(opts: { send?: Sender; tenants?: Record<string, Partial<TenantConfig>>; maxBacklog?: number } = {}) {
  const clock = new FakeClock();
  const recorder = recordingSender(clock);
  const logs: ({ level: string; msg: string } & LogFields)[] = [];
  const log: Logger = (level, msg, fields) => logs.push({ level, msg, ...fields });
  const configs = new Map(Object.entries(opts.tenants ?? { acme: {}, globex: {} }).map(([id, c]) => [id, { ...base, ...c }]));
  const tenants = createTenants(configs, {
    limits: { concurrency: 10, maxBacklog: opts.maxBacklog ?? 100 },
    send: opts.send ?? recorder.send,
    clock,
    log,
  });
  let n = 0;
  const server = createRelayServer({ tenants, log, maxBodyBytes: 1024, newId: () => `id-${++n}` });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: BodyInit = '{}', headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    fetch(url + path, { method: 'POST', body, headers });
  return { url, post, clock, calls: recorder.calls, logs };
}

test('accepts a webhook with 202 and forwards the exact bytes, content type and id', async () => {
  const { post, clock, calls } = await startRelay();
  const bytes = new Uint8Array([0, 255, 1, 254, 10, 13]);
  const res = await post('/webhooks/acme', bytes, { 'content-type': 'application/octet-stream' });

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { id: 'id-1' });
  await clock.advance(0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.req.url, base.destination);
  assert.equal(calls[0]!.req.webhookId, 'id-1');
  assert.equal(calls[0]!.req.contentType, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(calls[0]!.req.body), bytes);
});

test('forwards no content type when none was sent', async () => {
  const { url, clock, calls } = await startRelay();
  const res = await fetch(`${url}/webhooks/acme`, { method: 'POST', body: new Uint8Array([1, 2, 3]) });
  assert.equal(res.status, 202);
  await clock.advance(0);
  assert.equal(calls[0]!.req.contentType, undefined);
});

test('replies 202 without waiting for delivery', async () => {
  const { post } = await startRelay({ send: () => never() });
  const res = await post('/webhooks/acme');
  assert.equal(res.status, 202);
});

test('404 for unknown tenants and unknown paths, and nothing is forwarded', async () => {
  const { post, clock, calls } = await startRelay();
  for (const path of ['/webhooks/nobody', '/webhooks/__proto__', '/webhooks/constructor', '/webhooks/', '/webhooks/acme/extra', '/other', '/webhooks/%E0']) {
    const res = await post(path);
    assert.equal(res.status, 404, path);
  }
  await clock.advance(60_000);
  assert.equal(calls.length, 0);
});

test('405 for non-POST methods', async () => {
  const { url } = await startRelay();
  const res = await fetch(`${url}/webhooks/acme`);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

test('rate limits per tenant with 429 and Retry-After, without forwarding or affecting other tenants', async () => {
  const { post, clock, calls } = await startRelay();
  assert.equal((await post('/webhooks/acme')).status, 202);
  await clock.advance(400);
  assert.equal((await post('/webhooks/acme')).status, 202);

  const limited = await post('/webhooks/acme');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1'); // 600ms rounded up to whole seconds

  assert.equal((await post('/webhooks/globex')).status, 202, 'other tenant unaffected');

  await clock.advance(600);
  assert.equal((await post('/webhooks/acme')).status, 202, 'slot freed after the window');

  await clock.advance(0);
  assert.deepEqual(calls.map((c) => c.req.webhookId), ['id-1', 'id-2', 'id-3', 'id-4']);
});

test('413 for bodies over the size limit', async () => {
  const { post, clock, calls } = await startRelay();
  const res = await post('/webhooks/acme', 'x'.repeat(1025));
  assert.equal(res.status, 413);
  assert.equal((await post('/webhooks/acme', 'x'.repeat(1024))).status, 202);
  await clock.advance(0);
  assert.equal(calls.length, 1);
});

test('503 with Retry-After when the tenant backlog is full', async () => {
  const { post } = await startRelay({ send: () => never(), maxBacklog: 1, tenants: { acme: { requestsPerSecond: 100 } } });
  assert.equal((await post('/webhooks/acme')).status, 202);
  const res = await post('/webhooks/acme');
  assert.equal(res.status, 503);
  assert.ok(res.headers.get('retry-after'));
});

test('logs every request without logging the body', async () => {
  const { post, logs } = await startRelay();
  const secret = 'sk_live_51HzDoNotLogMe';
  await post('/webhooks/acme', JSON.stringify({ apiKey: secret }));
  await post('/webhooks/nobody', JSON.stringify({ apiKey: secret }));

  const requestLogs = logs.filter((l) => l.msg === 'request');
  assert.deepEqual(requestLogs.map((l) => [l.path, l.status]), [['/webhooks/acme', 202], ['/webhooks/nobody', 404]]);
  assert.equal(requestLogs[0]!.webhookId, 'id-1');
  assert.equal(requestLogs[0]!.bodyBytes, 35);
  assert.match(String(requestLogs[0]!.bodySha256), /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(logs).includes(secret), 'secret must not appear in logs');
});
