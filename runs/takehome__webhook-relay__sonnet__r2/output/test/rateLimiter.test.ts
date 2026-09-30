import { test } from "node:test";
import assert from "node:assert/strict";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";

test("admits up to the limit then rejects with time until a slot frees", () => {
  let now = 0;
  const l = new SlidingWindowLimiter(2, () => now);
  assert.deepEqual(l.tryAcquire(), { allowed: true });
  now = 300;
  assert.deepEqual(l.tryAcquire(), { allowed: true });
  now = 400;
  assert.deepEqual(l.tryAcquire(), { allowed: false, retryAfterMs: 600 });
});

test("frees a slot exactly one window after the hit", () => {
  let now = 0;
  const l = new SlidingWindowLimiter(1, () => now);
  l.tryAcquire();
  now = 999;
  assert.equal(l.tryAcquire().allowed, false);
  now = 1000;
  assert.equal(l.tryAcquire().allowed, true);
});

test("never allows more than limit in any one-second span (no boundary burst)", () => {
  let now = 0;
  const l = new SlidingWindowLimiter(3, () => now);
  const accepted: number[] = [];
  for (now = 0; now < 5000; now += 50) if (l.tryAcquire().allowed) accepted.push(now);
  for (const t of accepted) {
    assert.ok(accepted.filter((x) => x >= t && x < t + 1000).length <= 3);
  }
});
