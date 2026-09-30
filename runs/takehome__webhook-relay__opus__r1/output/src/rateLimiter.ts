import type { Clock } from './clock.ts';

export type RateDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Sliding-window log: allows at most `limit` acquisitions in any `windowMs`
 * span. Unlike a fixed window this never lets 2x the limit through across a
 * window boundary, and unlike a token bucket it has no burst allowance beyond
 * the limit itself. Memory is O(limit) per tenant.
 */
export class SlidingWindowRateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #clock: Clock;
  /** Timestamps of accepted acquisitions within the current window, oldest first. */
  readonly #hits: number[] = [];

  constructor(limit: number, windowMs: number, clock: Clock) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#clock = clock;
  }

  tryAcquire(): RateDecision {
    const now = this.#clock.now();
    while (this.#hits.length > 0 && this.#hits[0]! <= now - this.#windowMs) {
      this.#hits.shift();
    }
    if (this.#hits.length < this.#limit) {
      this.#hits.push(now);
      return { allowed: true };
    }
    // A slot frees up once the oldest hit leaves the window.
    return { allowed: false, retryAfterMs: this.#hits[0]! + this.#windowMs - now };
  }
}
