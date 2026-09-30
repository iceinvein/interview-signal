/**
 * The only source of time in the service. Everything time-dependent (rate
 * limiting, retry backoff) goes through this so tests can drive time
 * deterministically instead of sleeping.
 */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    setTimeout(fn, ms);
  },
};
