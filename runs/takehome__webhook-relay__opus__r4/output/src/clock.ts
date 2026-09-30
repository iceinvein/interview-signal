/**
 * The only source of time in the service. Everything time-dependent (rate
 * limiting, retry backoff) goes through this so tests can drive it
 * deterministically instead of sleeping.
 */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    // Pending retries must not keep the process alive on shutdown.
    setTimeout(fn, ms).unref();
  },
};
