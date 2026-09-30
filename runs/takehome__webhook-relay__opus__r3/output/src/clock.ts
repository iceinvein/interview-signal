/**
 * Everything time-dependent (rate limiting, retry backoff) goes through this
 * interface so tests can drive time explicitly instead of sleeping.
 */
export interface Clock {
  now(): number;
  /** Schedules `fn` after `ms` milliseconds. */
  setTimeout(fn: () => void, ms: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    // Retry timers must not keep the process alive on shutdown.
    setTimeout(fn, ms).unref();
  },
};
