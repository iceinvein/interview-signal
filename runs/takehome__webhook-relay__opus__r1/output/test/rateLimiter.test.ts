import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SlidingWindowRateLimiter } from '../src/rateLimiter.ts';
import { FakeClock } from './helpers.ts';

test('allows up to the limit, then rejects with the time until a slot frees', () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter(3, 1000, clock);
  assert.deepEqual([limiter.tryAcquire(), limiter.tryAcquire(), limiter.tryAcquire()], [
    { allowed: true },
    { allowed: true },
    { allowed: true },
  ]);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 1000 });
});

test('a slot frees exactly one window after it was taken', async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter(1, 1000, clock);
  assert.equal(limiter.tryAcquire().allowed, true);
  await clock.advance(999);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 1 });
  await clock.advance(1);
  assert.equal(limiter.tryAcquire().allowed, true);
});

test('rejected attempts do not consume slots', async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter(1, 1000, clock);
  limiter.tryAcquire();
  for (let i = 0; i < 10; i++) limiter.tryAcquire();
  await clock.advance(1000);
  assert.equal(limiter.tryAcquire().allowed, true);
});

test('never admits more than the limit in any one-second span, even across second boundaries', async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter(5, 1000, clock);
  const acceptedAt: number[] = [];
  // Hammer it every 50ms for 5 seconds.
  for (let t = 0; t < 5000; t += 50) {
    if (limiter.tryAcquire().allowed) acceptedAt.push(clock.now());
    await clock.advance(50);
  }
  for (const start of acceptedAt) {
    const inWindow = acceptedAt.filter((t) => t >= start && t < start + 1000).length;
    assert.ok(inWindow <= 5, `${inWindow} accepted in the second starting at ${start}`);
  }
  // And it isn't needlessly strict: 5 per second over 5 seconds.
  assert.equal(acceptedAt.length, 25);
});

test('retryAfterMs points at the oldest hit leaving the window', async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter(2, 1000, clock);
  limiter.tryAcquire(); // t=0
  await clock.advance(600);
  limiter.tryAcquire(); // t=600
  await clock.advance(100);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 300 });
  await clock.advance(300);
  assert.equal(limiter.tryAcquire().allowed, true);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 600 });
});
