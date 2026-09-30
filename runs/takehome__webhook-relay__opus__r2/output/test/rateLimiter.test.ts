import assert from "node:assert/strict";
import { test } from "node:test";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";

function limiterAt(limit: number) {
  const clock = { now: 0 };
  const limiter = new SlidingWindowLimiter(limit, 1000, () => clock.now);
  return { clock, limiter };
}

test("admits up to the limit within one window, then rejects", () => {
  const { limiter } = limiterAt(3);
  assert.deepEqual(limiter.tryAcquire(), { allowed: true });
  assert.deepEqual(limiter.tryAcquire(), { allowed: true });
  assert.deepEqual(limiter.tryAcquire(), { allowed: true });
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 1000 });
});

test("reports time until the oldest admission leaves the window", () => {
  const { clock, limiter } = limiterAt(2);
  limiter.tryAcquire(); // t=0
  clock.now = 300;
  limiter.tryAcquire(); // t=300
  clock.now = 400;
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 600 });
});

test("admits again exactly when the oldest admission is a full window old", () => {
  const { clock, limiter } = limiterAt(1);
  limiter.tryAcquire();
  clock.now = 999;
  assert.equal(limiter.tryAcquire().allowed, false);
  clock.now = 1000;
  assert.equal(limiter.tryAcquire().allowed, true);
});

test("never admits more than the limit in any one-second span", () => {
  // A token bucket with burst N would admit 2N across a boundary; this must not.
  const { clock, limiter } = limiterAt(5);
  let admitted: number[] = [];
  for (clock.now = 0; clock.now < 5000; clock.now += 50) {
    if (limiter.tryAcquire().allowed) admitted.push(clock.now);
  }
  for (const start of admitted) {
    const inWindow = admitted.filter((t) => t >= start && t < start + 1000);
    assert.ok(inWindow.length <= 5, `window at ${start} admitted ${inWindow.length}`);
  }
  assert.equal(admitted.length, 25);
});

test("rejected requests do not consume capacity", () => {
  const { clock, limiter } = limiterAt(1);
  limiter.tryAcquire();
  for (clock.now = 100; clock.now < 1000; clock.now += 100) limiter.tryAcquire();
  clock.now = 1000;
  assert.equal(limiter.tryAcquire().allowed, true);
});
