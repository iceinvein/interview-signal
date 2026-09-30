import type { Clock } from "./clock.ts";

export type RateDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Sliding-window log: remembers the timestamps of the last `limit` accepted
 * requests. A request is allowed only if fewer than `limit` were accepted in
 * the preceding `windowMs`, so no 1-second window ever contains more than
 * `limit` acceptances (unlike a fixed window, which allows 2x across a
 * boundary, or a token bucket, which is a different contract).
 *
 * Memory is O(limit) per tenant, which is fine for per-second limits.
 */
export class SlidingWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #clock: Clock;
  // Ring buffer of acceptance timestamps, oldest at #head once full.
  readonly #stamps: number[] = [];
  #head = 0;

  constructor(limit: number, windowMs: number, clock: Clock) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#clock = clock;
  }

  tryAcquire(): RateDecision {
    const now = this.#clock.now();
    if (this.#stamps.length < this.#limit) {
      this.#stamps.push(now);
      return { allowed: true };
    }
    const oldest = this.#stamps[this.#head]!;
    const freeAt = oldest + this.#windowMs;
    if (now < freeAt) {
      return { allowed: false, retryAfterMs: freeAt - now };
    }
    this.#stamps[this.#head] = now;
    this.#head = (this.#head + 1) % this.#limit;
    return { allowed: true };
  }
}
