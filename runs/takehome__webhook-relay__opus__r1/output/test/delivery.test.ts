import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TenantConfig } from '../src/config.ts';
import { backoffMs, TenantDelivery, type Sender, type Webhook } from '../src/delivery.ts';
import { silentLogger } from '../src/log.ts';
import { FakeClock, never, recordingSender } from './helpers.ts';

const config: TenantConfig = {
  destination: 'https://dest.example/hook',
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 100,
};

function webhook(id: string): Webhook {
  return { id, body: new Uint8Array(Buffer.from(`body-${id}`)), contentType: 'application/json' };
}

function delivery(clock: FakeClock, send: Sender, overrides: Partial<TenantConfig> = {}, limits = {}) {
  return new TenantDelivery('acme', { ...config, ...overrides }, {
    limits: { concurrency: 10, maxBacklog: 100, ...limits },
    send,
    clock,
    log: silentLogger,
  });
}

const fail = { ok: false, status: 500 };

test('backoff doubles from initialBackoffMs', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => backoffMs(250, n)), [250, 500, 1000, 2000]);
});

test('delivers once on 2xx, passing body, content type and id through', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock);
  const d = delivery(clock, send);
  d.enqueue(webhook('w1'));
  await clock.advance(0);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.req, {
    url: 'https://dest.example/hook',
    webhookId: 'w1',
    body: webhook('w1').body,
    contentType: 'application/json',
  });
  await clock.advance(60_000);
  assert.equal(calls.length, 1);
  assert.equal(d.backlog, 0);
});

test('retries failures at initialBackoffMs, then doubling, up to maxAttempts in total', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, () => fail);
  const d = delivery(clock, send);
  d.enqueue(webhook('w1'));

  await clock.advance(999);
  assert.equal(calls.length, 1, 'no retry before initialBackoffMs');
  await clock.advance(1);
  assert.equal(calls.length, 2);

  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000, 7000]);
  assert.ok(calls.every((c) => c.req.webhookId === 'w1'), 'same id on every attempt');
  assert.equal(clock.pendingTimers, 0);
  assert.equal(d.backlog, 0);
});

test('stops retrying as soon as an attempt succeeds', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, (_, i) => (i < 2 ? fail : { ok: true, status: 204 }));
  const d = delivery(clock, send);
  d.enqueue(webhook('w1'));
  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000]);
  assert.equal(d.backlog, 0);
});

test('maxAttempts of 1 means no retries', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, () => fail);
  delivery(clock, send, { maxAttempts: 1 }).enqueue(webhook('w1'));
  await clock.advance(60_000);
  assert.equal(calls.length, 1);
});

test('a sender that throws counts as a failed attempt', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, (_, i) => {
    if (i === 0) throw new Error('boom');
    return { ok: true, status: 200 };
  });
  delivery(clock, send).enqueue(webhook('w1'));
  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000]);
});

test('caps in-flight attempts at the concurrency limit', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, () => never());
  const d = delivery(clock, send, {}, { concurrency: 2 });
  for (let i = 0; i < 5; i++) d.enqueue(webhook(`w${i}`));
  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.req.webhookId), ['w0', 'w1']);
});

test('a webhook waiting to retry does not hold a concurrency slot', async () => {
  const clock = new FakeClock();
  const { send, calls } = recordingSender(clock, (req) => (req.webhookId === 'w1' ? fail : { ok: true, status: 200 }));
  const d = delivery(clock, send, { maxAttempts: 2 }, { concurrency: 1 });
  d.enqueue(webhook('w1'));
  d.enqueue(webhook('w2'));
  await clock.advance(0);
  assert.deepEqual(calls.map((c) => [c.req.webhookId, c.at]), [['w1', 0], ['w2', 0]]);
});

test('rejects new webhooks once the backlog is full, counting ones waiting to retry', async () => {
  const clock = new FakeClock();
  const { send } = recordingSender(clock, (_, i) => (i === 0 ? fail : { ok: true, status: 200 }));
  const d = delivery(clock, send, {}, { maxBacklog: 1 });
  assert.equal(d.enqueue(webhook('w1')), true);
  await clock.advance(0); // w1 failed and is waiting to retry
  assert.equal(d.enqueue(webhook('w2')), false);
  await clock.advance(1000); // w1 delivered on retry
  assert.equal(d.enqueue(webhook('w3')), true);
});

test("one tenant's hung destination does not delay another tenant", async () => {
  const clock = new FakeClock();
  const slow = recordingSender(clock, () => never());
  const fast = recordingSender(clock);
  const limits = { concurrency: 2 };
  const a = delivery(clock, slow.send, {}, limits);
  const b = delivery(clock, fast.send, {}, limits);

  for (let i = 0; i < 50; i++) a.enqueue(webhook(`a${i}`));
  b.enqueue(webhook('b1'));
  await clock.advance(0);

  assert.deepEqual(fast.calls.map((c) => [c.req.webhookId, c.at]), [['b1', 0]]);
  assert.equal(b.backlog, 0);
});
