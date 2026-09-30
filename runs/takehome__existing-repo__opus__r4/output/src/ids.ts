import { randomUUID } from "node:crypto";

export type IdGenerator = (prefix: IdPrefix) => string;

export type IdPrefix = "mem" | "ses" | "bkg";

export const randomIds: IdGenerator = (prefix) => `${prefix}_${randomUUID()}`;

// Deterministic ids for tests: mem_1, mem_2, ses_1, ...
export function sequentialIds(): IdGenerator {
  const counters = new Map<IdPrefix, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}
