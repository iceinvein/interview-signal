export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Sliding-window limiter: never more than `limit` accepts in any 1000ms window.
 * (A token bucket would allow up to 2x the limit across a window boundary.)
 */
export class RateLimiter {
  private readonly accepted: number[] = [];
  private readonly limit: number;
  private readonly now: () => number;

  constructor(limit: number, now: () => number) {
    this.limit = limit;
    this.now = now;
  }

  tryAcquire(): RateDecision {
    const now = this.now();
    while (this.accepted.length > 0 && this.accepted[0]! <= now - 1000) this.accepted.shift();
    if (this.accepted.length < this.limit) {
      this.accepted.push(now);
      return { allowed: true };
    }
    const waitMs = this.accepted[0]! + 1000 - now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }
}
