/**
 * Sliding-window limiter: at most `limit` admissions in any window of `windowMs`.
 * Stricter than a token bucket, which permits up to 2x the limit across a refill boundary.
 * Memory is O(limit) per tenant.
 */
export class SlidingWindowLimiter {
  private readonly admitted: number[] = [];
  private readonly limit: number;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(limit: number, now: () => number, windowMs = 1000) {
    this.limit = limit;
    this.now = now;
    this.windowMs = windowMs;
  }

  /** Returns 0 and records the admission, or the milliseconds until a slot frees up. */
  tryAcquire(): number {
    const t = this.now();
    while (this.admitted.length > 0 && this.admitted[0]! <= t - this.windowMs) {
      this.admitted.shift();
    }
    if (this.admitted.length >= this.limit) {
      return this.admitted[0]! + this.windowMs - t;
    }
    this.admitted.push(t);
    return 0;
  }
}
