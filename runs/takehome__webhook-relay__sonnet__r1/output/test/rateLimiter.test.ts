import assert from "node:assert/strict";
import { test } from "node:test";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";
import { FakeClock } from "./helpers.ts";

test("allows up to the limit, then rejects with time until the oldest slot frees", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(3, clock);
  assert.equal(limiter.tryAcquire().ok, true);
  await clock.advance(100);
  assert.equal(limiter.tryAcquire().ok, true);
  assert.equal(limiter.tryAcquire().ok, true);

  assert.deepEqual(limiter.tryAcquire(), { ok: false, retryAfterMs: 900 });
});

test("a slot frees exactly one second after it was used", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(1, clock);
  limiter.tryAcquire();
  await clock.advance(999);
  assert.equal(limiter.tryAcquire().ok, false);
  await clock.advance(1);
  assert.equal(limiter.tryAcquire().ok, true);
});

test("never admits more than the limit in any one-second span (no boundary burst)", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(5, clock);
  const admitted: number[] = [];
  for (let t = 0; t < 5000; t += 50) {
    if (limiter.tryAcquire().ok) admitted.push(clock.now());
    await clock.advance(50);
  }
  for (const start of admitted) {
    const inWindow = admitted.filter((t) => t >= start && t < start + 1000).length;
    assert.ok(inWindow <= 5, `${inWindow} admitted in window starting ${start}`);
  }
});
