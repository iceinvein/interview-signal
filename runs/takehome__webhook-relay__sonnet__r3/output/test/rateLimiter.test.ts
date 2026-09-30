import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/rateLimiter.ts";

test("admits up to the limit, then rejects with time until the oldest expires", () => {
  const l = new RateLimiter(3);
  assert.deepEqual([l.tryAcquire(0), l.tryAcquire(100), l.tryAcquire(200)], [{ ok: true }, { ok: true }, { ok: true }]);
  assert.deepEqual(l.tryAcquire(300), { ok: false, retryAfterMs: 700 });
});

test("a slot frees exactly 1000ms after it was used", () => {
  const l = new RateLimiter(1);
  assert.equal(l.tryAcquire(0).ok, true);
  assert.equal(l.tryAcquire(999).ok, false);
  assert.equal(l.tryAcquire(1000).ok, true);
});

test("never allows more than the limit in any 1s window (no boundary burst)", () => {
  const l = new RateLimiter(2);
  assert.equal(l.tryAcquire(900).ok, true);
  assert.equal(l.tryAcquire(950).ok, true);
  // A fixed-window counter would reset at t=1000 and admit two more.
  assert.equal(l.tryAcquire(1000).ok, false);
  assert.equal(l.tryAcquire(1849).ok, false);
  assert.equal(l.tryAcquire(1900).ok, true);
});

test("rejected requests are not counted against the window", () => {
  const l = new RateLimiter(1);
  l.tryAcquire(0);
  for (let t = 1; t < 1000; t += 100) l.tryAcquire(t);
  assert.equal(l.tryAcquire(1000).ok, true);
});
