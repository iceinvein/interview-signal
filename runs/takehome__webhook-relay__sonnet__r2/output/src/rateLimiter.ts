export type RateDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Sliding-window log: never admits more than `limit` events in any window of
 * `windowMs`. Exact (unlike a token bucket, which permits up to 2x at a
 * refill boundary), and cheap because limit is small.
 */
export class SlidingWindowLimiter {
  private readonly hits: number[] = [];

  private readonly limit: number;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(limit: number, now: () => number, windowMs = 1000) {
    this.limit = limit;
    this.now = now;
    this.windowMs = windowMs;
  }

  tryAcquire(): RateDecision {
    const now = this.now();
    while (this.hits.length > 0 && this.hits[0]! <= now - this.windowMs) this.hits.shift();
    if (this.hits.length >= this.limit) {
      return { allowed: false, retryAfterMs: this.hits[0]! + this.windowMs - now };
    }
    this.hits.push(now);
    return { allowed: true };
  }
}
