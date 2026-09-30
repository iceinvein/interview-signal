import type { Clock } from "./clock.ts";

export type Acquire = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Sliding-window log: at most `limit` acquisitions in any window of `windowMs`.
 * Chosen over a token bucket because a bucket of capacity N can admit 2N inside
 * one second (a full burst just before and just after a refill), which would
 * break "at most N per second". Memory is O(limit) per tenant.
 */
export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];
  private readonly limit: number;
  private readonly clock: Clock;
  private readonly windowMs: number;

  constructor(limit: number, clock: Clock, windowMs = 1000) {
    this.limit = limit;
    this.clock = clock;
    this.windowMs = windowMs;
  }

  tryAcquire(): Acquire {
    const now = this.clock.now();
    while (this.stamps.length > 0 && this.stamps[0]! <= now - this.windowMs) this.stamps.shift();

    if (this.stamps.length >= this.limit) {
      return { ok: false, retryAfterMs: this.stamps[0]! + this.windowMs - now };
    }
    this.stamps.push(now);
    return { ok: true };
  }
}
