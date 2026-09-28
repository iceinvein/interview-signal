import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";

function limiterAt(limit: number) {
  const clock = { now: 0 };
  const limiter = new SlidingWindowLimiter(limit, 1000, () => clock.now);
  return { clock, limiter };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit within one window", () => {
    const { limiter } = limiterAt(3);
    expect([limiter.tryAcquire(), limiter.tryAcquire(), limiter.tryAcquire()]).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
    ]);
  });

  it("rejects the request past the limit and says when the oldest slot frees up", () => {
    const { clock, limiter } = limiterAt(2);
    limiter.tryAcquire();
    clock.now = 300;
    limiter.tryAcquire();
    clock.now = 400;
    expect(limiter.tryAcquire()).toEqual({ allowed: false, retryAfterMs: 600 });
  });

  it("counts over a rolling window rather than resetting on second boundaries", () => {
    const { clock, limiter } = limiterAt(2);
    limiter.tryAcquire();
    clock.now = 500;
    limiter.tryAcquire();
    clock.now = 1000;
    expect(limiter.tryAcquire()).toEqual({ allowed: true });
    clock.now = 1100;
    expect(limiter.tryAcquire().allowed).toBe(false);
  });

  it("does not spend a slot on a rejected request", () => {
    const { clock, limiter } = limiterAt(1);
    limiter.tryAcquire();
    clock.now = 999;
    limiter.tryAcquire();
    clock.now = 1000;
    expect(limiter.tryAcquire()).toEqual({ allowed: true });
  });
});
