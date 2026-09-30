export type RateDecision = { ok: true } | { ok: false; retryAfterMs: number };

const WINDOW_MS = 1000;

/**
 * Sliding-window-log limiter: at most `limit` admissions in any 1000ms window.
 * (A token bucket would allow up to 2x the limit across a bucket-refill boundary.)
 * Only admitted requests are recorded, so rejected ones cost the caller nothing.
 */
export class RateLimiter {
  private readonly admitted: number[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  tryAcquire(now: number): RateDecision {
    // An admission at time t stops counting at t + WINDOW_MS.
    while (this.admitted.length > 0 && this.admitted[0]! <= now - WINDOW_MS) this.admitted.shift();
    if (this.admitted.length >= this.limit) {
      return { ok: false, retryAfterMs: this.admitted[0]! + WINDOW_MS - now };
    }
    this.admitted.push(now);
    return { ok: true };
  }
}
