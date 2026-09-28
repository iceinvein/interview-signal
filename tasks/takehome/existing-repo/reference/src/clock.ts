// Services read time only through a Clock so tests can pin it.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(at: Date): Clock & { set(at: Date): void; advanceMinutes(n: number): void } {
  let current = new Date(at);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next);
    },
    advanceMinutes: (n) => {
      current = new Date(current.getTime() + n * 60_000);
    },
  };
}
