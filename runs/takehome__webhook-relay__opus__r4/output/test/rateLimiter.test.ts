import assert from "node:assert/strict";
import { test } from "node:test";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";
import { FakeClock } from "./helpers.ts";

test("allows up to the limit, then rejects with time until a slot frees", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(3, 1000, clock);

  assert.equal(limiter.tryAcquire().allowed, true); // t=0
  await clock.advance(100);
  assert.equal(limiter.tryAcquire().allowed, true); // t=100
  assert.equal(limiter.tryAcquire().allowed, true); // t=100
  await clock.advance(300);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 600 }); // t=400, slot from t=0 frees at 1000
});

test("a slot frees exactly one window after it was used", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(2, 1000, clock);
  limiter.tryAcquire(); // t=0
  await clock.advance(500);
  limiter.tryAcquire(); // t=500

  await clock.advance(499); // t=999
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 1 });
  await clock.advance(1); // t=1000: the t=0 slot is free, the t=500 one is not
  assert.equal(limiter.tryAcquire().allowed, true);
  assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 500 });
});

test("rejected requests do not consume capacity", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(1, 1000, clock);
  limiter.tryAcquire();
  for (let i = 0; i < 100; i++) assert.equal(limiter.tryAcquire().allowed, false);
  await clock.advance(1000);
  assert.equal(limiter.tryAcquire().allowed, true);
});

test("never admits more than the limit in any one-second window, unlike a fixed window", async () => {
  const clock = new FakeClock();
  const limiter = new SlidingWindowLimiter(5, 1000, clock);
  const accepted: number[] = [];
  // Hammer it every 10ms for 5 seconds.
  for (let t = 0; t < 5000; t += 10) {
    if (limiter.tryAcquire().allowed) accepted.push(clock.now());
    await clock.advance(10);
  }
  for (const start of accepted) {
    const inWindow = accepted.filter((t) => t >= start && t < start + 1000).length;
    assert.ok(inWindow <= 5, `window starting ${start} had ${inWindow}`);
  }
  assert.equal(accepted.length, 25);
});
