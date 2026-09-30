/**
 * Sliding-window log: at most `limit` acquisitions in any `windowMs` interval.
 * Stricter than a fixed window (no 2x burst at the boundary) and memory is
 * bounded by `limit` timestamps per tenant.
 */
export class SlidingWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  #hits: number[] = [];

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  /** Returns 0 if a slot was taken, otherwise the ms until one frees up. */
  tryAcquire(): number {
    const now = this.#now();
    while (this.#hits.length > 0 && this.#hits[0]! <= now - this.#windowMs) {
      this.#hits.shift();
    }
    if (this.#hits.length < this.#limit) {
      this.#hits.push(now);
      return 0;
    }
    return this.#hits[0]! + this.#windowMs - now;
  }
}
