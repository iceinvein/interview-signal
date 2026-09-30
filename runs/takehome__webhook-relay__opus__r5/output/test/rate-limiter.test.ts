import assert from "node:assert/strict";
import { test } from "node:test";
import { SlidingWindowLimiter } from "../src/rate-limiter.ts";

test("allows up to the limit, then reports how long until a slot frees", () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter(2, 1000, () => now);
  assert.equal(limiter.tryAcquire(), 0);
  assert.equal(limiter.tryAcquire(), 0);
  assert.equal(limiter.tryAcquire(), 1000);
  now = 999;
  assert.equal(limiter.tryAcquire(), 1);
  now = 1000;
  assert.equal(limiter.tryAcquire(), 0);
});

test("window slides: no double burst across a second boundary", () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter(2, 1000, () => now);
  assert.equal(limiter.tryAcquire(), 0); // t=0
  now = 500;
  assert.equal(limiter.tryAcquire(), 0); // t=500
  now = 1000;
  assert.equal(limiter.tryAcquire(), 0, "t=0 slot has expired");
  now = 1200;
  assert.equal(limiter.tryAcquire(), 300, "t=500 slot frees at 1500");
  now = 1500;
  assert.equal(limiter.tryAcquire(), 0);
});

test("rejected attempts do not consume slots", () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter(1, 1000, () => now);
  assert.equal(limiter.tryAcquire(), 0);
  for (let i = 0; i < 10; i++) limiter.tryAcquire();
  now = 1000;
  assert.equal(limiter.tryAcquire(), 0);
});
