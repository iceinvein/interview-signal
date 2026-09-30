import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";
import { FakeClock } from "./fakeClock.ts";

describe("SlidingWindowLimiter", () => {
  it("allows exactly `limit` acquisitions within one second", () => {
    const limiter = new SlidingWindowLimiter(3, new FakeClock());
    for (let i = 0; i < 3; i++) assert.deepEqual(limiter.tryAcquire(), { allowed: true });
    assert.equal(limiter.tryAcquire().allowed, false);
  });

  it("frees a slot exactly one second after the oldest acceptance", async () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(2, clock);
    limiter.tryAcquire(); // t=0
    await clock.advance(400);
    limiter.tryAcquire(); // t=400

    await clock.advance(599); // t=999
    assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 1 });

    await clock.advance(1); // t=1000: the t=0 hit has left the window
    assert.deepEqual(limiter.tryAcquire(), { allowed: true });
    // Next slot frees when the t=400 hit expires.
    assert.deepEqual(limiter.tryAcquire(), { allowed: false, retryAfterMs: 400 });
  });

  it("does not allow a burst straddling a second boundary to exceed the limit", async () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(5, clock);
    await clock.advance(900);
    for (let i = 0; i < 5; i++) assert.equal(limiter.tryAcquire().allowed, true);
    await clock.advance(200); // t=1100: a fixed window would have reset here
    assert.equal(limiter.tryAcquire().allowed, false);
  });

  it("rejected attempts do not consume capacity", async () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(1, clock);
    limiter.tryAcquire();
    for (let i = 0; i < 10; i++) limiter.tryAcquire();
    await clock.advance(1000);
    assert.equal(limiter.tryAcquire().allowed, true);
  });
});
