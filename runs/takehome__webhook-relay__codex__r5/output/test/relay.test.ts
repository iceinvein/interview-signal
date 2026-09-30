import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Relay, type DeliveryEvent, type Webhook } from '../src/relay.js';
import type { TenantConfig } from '../src/config.js';

const base: TenantConfig = {
  destination: 'https://example.test/hook', maxAttempts: 3,
  initialBackoffMs: 100, requestsPerSecond: 2,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('retries failures with doubling delays and a stable webhook ID', async () => {
  const done = deferred<void>();
  const attempts: Webhook[] = [];
  const delays: number[] = [];
  const events: DeliveryEvent[] = [];
  const relay = new Relay(new Map([['acme', base]]), {
    deliver: async (_tenant, webhook) => {
      attempts.push(webhook);
      if (attempts.length === 1) throw new Error('connection refused');
      return attempts.length === 2 ? 503 : 204;
    },
    sleep: async (ms) => { delays.push(ms); },
    report: (event) => {
      events.push(event);
      if (event.outcome === 'delivered') done.resolve();
    },
  });

  const accepted = relay.accept('acme', Buffer.from([0, 255]), 'application/octet-stream');
  assert.equal(accepted.kind, 'accepted');
  await done.promise;
  assert.deepEqual(delays, [100, 200]);
  assert.equal(attempts.length, 3);
  assert.ok(attempts.every((attempt) => attempt.id === attempts[0]!.id));
  assert.ok(attempts.every((attempt) => attempt.body.equals(Buffer.from([0, 255]))));
  assert.ok(attempts.every((attempt) => attempt.contentType === 'application/octet-stream'));
  assert.deepEqual(events.map((event) => event.outcome), ['retrying', 'retrying', 'delivered']);
});

test('stops after maxAttempts, including the first attempt', async () => {
  const done = deferred<void>();
  let calls = 0;
  const delays: number[] = [];
  const relay = new Relay(new Map([['acme', { ...base, maxAttempts: 2 }]]), {
    deliver: async () => { calls++; return 302; },
    sleep: async (ms) => { delays.push(ms); },
    report: (event) => { if (event.outcome === 'exhausted') done.resolve(); },
  });
  relay.accept('acme', Buffer.alloc(0));
  await done.promise;
  assert.equal(calls, 2);
  assert.deepEqual(delays, [100]);
});

test('rolling rate limit does not affect another tenant', async () => {
  let now = 0;
  const relay = new Relay(new Map([['acme', base], ['beta', { ...base, requestsPerSecond: 1 }]]), {
    now: () => now,
    deliver: async () => 204,
    report: () => {},
  });
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  now = 10;
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  now = 999;
  assert.deepEqual(relay.accept('acme', Buffer.alloc(0)), { kind: 'limited', retryAfter: 1 });
  assert.equal(relay.accept('beta', Buffer.alloc(0)).kind, 'accepted');
  now = 1000;
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  assert.deepEqual(relay.accept('beta', Buffer.alloc(0)), { kind: 'limited', retryAfter: 1 });
  assert.equal(relay.accept('missing', Buffer.alloc(0)).kind, 'unknown');
});

test('a blocked destination does not block delivery for another tenant', async () => {
  const releaseAcme = deferred<void>();
  const betaDelivered = deferred<void>();
  const relay = new Relay(new Map([['acme', base], ['beta', { ...base }]]), {
    deliver: async (tenant) => {
      if (tenant === base) await releaseAcme.promise;
      else betaDelivered.resolve();
      return 204;
    },
    report: () => {},
  });
  assert.equal(relay.accept('acme', Buffer.alloc(0)).kind, 'accepted');
  assert.equal(relay.accept('beta', Buffer.alloc(0)).kind, 'accepted');
  await betaDelivered.promise;
  releaseAcme.resolve();
});
