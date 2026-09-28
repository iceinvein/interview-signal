export type Acquisition = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * At most `limit` acquisitions in any rolling window of `windowMs`. A fixed
 * window would let a tenant send twice its limit across a boundary.
 */
export class SlidingWindowLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly acquiredAt: number[] = [];

  constructor(limit: number, windowMs: number, now: () => number) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  tryAcquire(): Acquisition {
    const now = this.now();
    while (this.acquiredAt.length > 0 && this.acquiredAt[0] <= now - this.windowMs) {
      this.acquiredAt.shift();
    }
    if (this.acquiredAt.length >= this.limit) {
      return { allowed: false, retryAfterMs: this.acquiredAt[0] + this.windowMs - now };
    }
    this.acquiredAt.push(now);
    return { allowed: true };
  }
}
