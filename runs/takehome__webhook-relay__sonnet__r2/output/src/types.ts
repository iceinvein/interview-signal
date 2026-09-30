export interface Tenant {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

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

export type Logger = (entry: Record<string, unknown>) => void;

export const jsonLogger: Logger = (entry) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }));
};

export interface Delivery {
  id: string;
  url: string;
  body: Buffer;
  contentType: string | undefined;
}

/** Performs one attempt and resolves with the HTTP status. Rejects on network failure. */
export type Send = (delivery: Delivery) => Promise<number>;
