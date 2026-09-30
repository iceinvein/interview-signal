import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Relay, type Delivery, type Webhook } from '../src/relay.js';
import { parseConfig } from '../src/config.js';

const tenant = { destination: 'https://example.test/relay', maxAttempts: 4, initialBackoffMs: 25, requestsPerSecond: 2 };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

async function eventually(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('condition did not become true');
}

test('retries failures with exponential delays and keeps the event ID', async () => {
  const calls: Webhook[] = [];
  const waits: number[] = [];
  const records: Record<string, unknown>[] = [];
  const statuses = [500, 302, 204];
  const relay = new Relay({ acme: tenant }, async (_url, event) => {
    calls.push(event);
    return statuses[calls.length - 1]!;
  }, record => records.push(record), undefined, async ms => { waits.push(ms); });

  const accepted = relay.accept('acme', Buffer.from([0, 255]), 'application/octet-stream');
  assert.equal(accepted.kind, 'accepted');
  await eventually(() => calls.length === 3);
  assert.deepEqual(waits, [25, 50]);
  assert.deepEqual(calls.map(call => call.id), [calls[0]!.id, calls[0]!.id, calls[0]!.id]);
  assert.deepEqual(calls.map(call => call.body), [Buffer.from([0, 255]), Buffer.from([0, 255]), Buffer.from([0, 255])]);
  assert.deepEqual(records.map(record => record.delivered), [false, false, true]);
});

test('connection errors count as attempts and stop at maxAttempts', async () => {
  let count = 0;
  const waits: number[] = [];
  const relay = new Relay({ acme: { ...tenant, maxAttempts: 3 } }, async () => {
    count++;
    throw new Error('connection refused');
  }, () => {}, undefined, async ms => { waits.push(ms); });
  relay.accept('acme', Buffer.alloc(0));
  await eventually(() => count === 3);
  assert.deepEqual(waits, [25, 50]);
});

test('sliding per-tenant limit rejects only over-limit requests and resets after one second', async () => {
  let now = 0;
  const delivered: string[] = [];
  const relay = new Relay({ acme: tenant, beta: { ...tenant, requestsPerSecond: 1 } }, async (url) => {
    delivered.push(url);
    return 200;
  }, () => {}, () => now);
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  now = 100;
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  now = 999;
  assert.deepEqual(relay.accept('acme', Buffer.alloc(0)), { kind: 'limited', retryAfterSeconds: 1 });
  assert.equal(relay.accept('beta', Buffer.alloc(0)).kind, 'accepted');
  assert.deepEqual(relay.accept('beta', Buffer.alloc(0)), { kind: 'limited', retryAfterSeconds: 1 });
  assert.equal(relay.accept('missing', Buffer.alloc(0)).kind, 'unknown');
  now = 1000;
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  await eventually(() => delivered.length === 4);
  assert.equal(delivered.length, 4);
});

test('a stalled tenant does not block another tenant', async () => {
  let release!: () => void;
  const stalled = new Promise<number>(resolve => { release = () => resolve(200); });
  const seen: string[] = [];
  const deliver: Delivery = async (url) => {
    seen.push(url);
    return url.includes('slow') ? stalled : 200;
  };
  const relay = new Relay({ slow: { ...tenant, destination: 'https://slow.test' }, fast: { ...tenant, destination: 'https://fast.test' } }, deliver, () => {});
  relay.accept('slow', Buffer.alloc(0));
  relay.accept('fast', Buffer.alloc(0));
  await eventually(() => seen.length === 2);
  assert.deepEqual(seen, ['https://slow.test', 'https://fast.test']);
  release();
});

test('invalid tenant settings fail at startup', () => {
  assert.throws(() => parseConfig({ tenants: { a: { ...tenant, destination: 'file:///etc/passwd' } } }));
  assert.throws(() => parseConfig({ tenants: { a: { ...tenant, maxAttempts: 0 } } }));
  assert.throws(() => parseConfig({ tenants: { a: { ...tenant, requestsPerSecond: 0 } } }));
});
