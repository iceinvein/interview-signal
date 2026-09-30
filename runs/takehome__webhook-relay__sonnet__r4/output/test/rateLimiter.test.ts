import assert from "node:assert/strict";
import { test } from "node:test";
import { RateLimiter } from "../src/rateLimiter.ts";

test("allows up to the limit, then rejects with Retry-After", () => {
  let t = 10_000;
  const rl = new RateLimiter(3, () => t);
  for (let i = 0; i < 3; i++) assert.deepEqual(rl.tryAcquire(), { allowed: true });
  assert.deepEqual(rl.tryAcquire(), { allowed: false, retryAfterSeconds: 1 });
});

test("window is sliding: a slot frees exactly 1000ms after it was used", () => {
  let t = 0;
  const rl = new RateLimiter(2, () => t);
  rl.tryAcquire(); // t=0
  t = 600;
  rl.tryAcquire(); // t=600
  t = 999;
  assert.equal(rl.tryAcquire().allowed, false);
  t = 1000;
  assert.equal(rl.tryAcquire().allowed, true); // the t=0 one has expired
  assert.equal(rl.tryAcquire().allowed, false); // t=600 and t=1000 remain
});

test("never exceeds the limit across a window boundary", () => {
  let t = 0;
  const rl = new RateLimiter(5, () => t);
  let accepted = 0;
  for (t = 0; t < 3000; t += 10) if (rl.tryAcquire().allowed) accepted++;
  assert.equal(accepted, 15); // 5 per second over 3 seconds
});

test("Retry-After rounds up and is at least 1", () => {
  let t = 0;
  const rl = new RateLimiter(1, () => t);
  rl.tryAcquire();
  t = 100;
  assert.deepEqual(rl.tryAcquire(), { allowed: false, retryAfterSeconds: 1 });
  t = 999;
  assert.deepEqual(rl.tryAcquire(), { allowed: false, retryAfterSeconds: 1 });
});
