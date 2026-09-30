import { test } from "node:test";
import assert from "node:assert/strict";
import { SlidingWindowLimiter } from "../src/rateLimiter.ts";

test("admits `limit` per window, then reports time until a slot frees", () => {
  let t = 10_000;
  const l = new SlidingWindowLimiter(3, () => t);
  assert.equal(l.tryAcquire(), 0);
  t += 100;
  assert.equal(l.tryAcquire(), 0);
  t += 100;
  assert.equal(l.tryAcquire(), 0);
  t += 100; // t = 10_300; oldest admitted at 10_000
  assert.equal(l.tryAcquire(), 700);
});

test("a slot frees exactly one window after admission", () => {
  let t = 0;
  const l = new SlidingWindowLimiter(1, () => t);
  assert.equal(l.tryAcquire(), 0);
  t = 999;
  assert.equal(l.tryAcquire(), 1);
  t = 1000;
  assert.equal(l.tryAcquire(), 0);
});

test("never allows more than `limit` in any 1s window, even across a boundary", () => {
  let t = 0;
  const l = new SlidingWindowLimiter(2, () => t);
  const admitted: number[] = [];
  for (t = 0; t < 5000; t += 50) if (l.tryAcquire() === 0) admitted.push(t);
  for (const a of admitted) {
    assert.ok(admitted.filter((b) => b >= a && b < a + 1000).length <= 2);
  }
  assert.ok(admitted.length >= 9); // and it still admits steadily
});

test("rejected attempts do not consume slots", () => {
  let t = 0;
  const l = new SlidingWindowLimiter(1, () => t);
  l.tryAcquire();
  for (t = 1; t < 1000; t++) l.tryAcquire();
  t = 1000;
  assert.equal(l.tryAcquire(), 0);
});
