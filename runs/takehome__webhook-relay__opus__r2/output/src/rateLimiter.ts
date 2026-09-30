export type Admission = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Sliding-window log: admits at most `limit` events in any window of `windowMs`.
 *
 * Chosen over a token bucket because the brief says "at most N per second"; a token
 * bucket with burst N can admit up to 2N inside a one-second span. Memory is O(limit)
 * per tenant, which is fine for per-second limits.
 */
export class SlidingWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #admitted: number[] = []; // timestamps, oldest first

  constructor(limit: number, windowMs: number, now: () => number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  tryAcquire(): Admission {
    const now = this.#now();
    // An admission at time t occupies the window (t, t + windowMs].
    while (this.#admitted.length > 0 && this.#admitted[0]! <= now - this.#windowMs) {
      this.#admitted.shift();
    }
    if (this.#admitted.length < this.#limit) {
      this.#admitted.push(now);
      return { allowed: true };
    }
    return { allowed: false, retryAfterMs: this.#admitted[0]! + this.#windowMs - now };
  }
}
