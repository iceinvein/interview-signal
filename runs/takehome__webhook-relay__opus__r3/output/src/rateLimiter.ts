import type { Clock } from "./clock.ts";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Sliding-window log limiter: at most `limit` acquisitions in any window of
 * `windowMs`. Unlike a token bucket or fixed window, this never lets a burst
 * straddling a boundary exceed the limit, which is the literal reading of
 * "at most N per second". Memory is O(limit) per tenant.
 */
export class SlidingWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #clock: Clock;
  /** Acceptance timestamps, oldest first. */
  readonly #hits: number[] = [];

  constructor(limit: number, clock: Clock, windowMs = 1000) {
    this.#limit = limit;
    this.#clock = clock;
    this.#windowMs = windowMs;
  }

  tryAcquire(): RateLimitResult {
    const now = this.#clock.now();
    while (this.#hits.length > 0 && this.#hits[0]! <= now - this.#windowMs) {
      this.#hits.shift();
    }
    if (this.#hits.length < this.#limit) {
      this.#hits.push(now);
      return { allowed: true };
    }
    // A slot frees up when the oldest hit leaves the window.
    return { allowed: false, retryAfterMs: this.#hits[0]! + this.#windowMs - now };
  }
}
