import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TenantDispatcher, type Send, type Webhook } from "../src/dispatcher.ts";
import { flush, tenant } from "../support/helpers.ts";

const hook = (id = "w1"): Webhook => ({ id, body: Buffer.from("x"), contentType: "text/plain" });
const opts = { concurrency: 2, maxOutstanding: 10 };

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

function setup(send: Send, cfg = tenant(), o = opts) {
  const events: Record<string, unknown>[] = [];
  const d = new TenantDispatcher("t", cfg, send, (e) => events.push(e), o);
  return { d, events };
}

test("2xx on first try: delivered once, no retry", async () => {
  const calls: string[] = [];
  const { d } = setup(async (_u, w) => (calls.push(w.id), 204));
  d.offer(hook());
  await flush();
  mock.timers.tick(60_000);
  await flush();
  assert.deepEqual(calls, ["w1"]);
});

test("backoff: initial, then doubling; same id every attempt; maxAttempts includes first try", async () => {
  const attempts: { at: number; id: string }[] = [];
  let clock = 0;
  const { d, events } = setup(async (_u, w) => (attempts.push({ at: clock, id: w.id }), 500), tenant({ maxAttempts: 4, initialBackoffMs: 1000 }));
  d.offer(hook("evt"));
  await flush();
  assert.equal(attempts.length, 1);

  // retry 1 after 1000ms: nothing at 999
  mock.timers.tick(999);
  await flush();
  assert.equal(attempts.length, 1);
  clock = 1000;
  mock.timers.tick(1);
  await flush();
  assert.equal(attempts.length, 2);

  // retry 2 after a further 2000ms
  mock.timers.tick(1999);
  await flush();
  assert.equal(attempts.length, 2);
  clock = 3000;
  mock.timers.tick(1);
  await flush();
  assert.equal(attempts.length, 3);

  // retry 3 after a further 4000ms
  mock.timers.tick(3999);
  await flush();
  assert.equal(attempts.length, 3);
  mock.timers.tick(1);
  await flush();
  assert.equal(attempts.length, 4);

  // exhausted: no fifth attempt ever
  mock.timers.tick(1_000_000);
  await flush();
  assert.equal(attempts.length, 4);
  assert.ok(attempts.every((a) => a.id === "evt"));
  assert.equal(events.at(-1)?.event, "gave_up");
});

test("maxAttempts 1 means no retries", async () => {
  let n = 0;
  const { d } = setup(async () => (n++, 500), tenant({ maxAttempts: 1 }));
  d.offer(hook());
  await flush();
  mock.timers.tick(1_000_000);
  await flush();
  assert.equal(n, 1);
});

test("connection errors are failed attempts and are retried; success stops retries", async () => {
  let n = 0;
  const { d, events } = setup(async () => {
    if (++n < 3) throw new Error("ECONNREFUSED");
    return 200;
  }, tenant({ maxAttempts: 5 }));
  d.offer(hook());
  await flush();
  mock.timers.tick(1000);
  await flush();
  mock.timers.tick(2000);
  await flush();
  assert.equal(n, 3);
  mock.timers.tick(1_000_000);
  await flush();
  assert.equal(n, 3);
  assert.equal(events.at(-1)?.event, "delivered");
});

test("non-2xx statuses (3xx, 4xx, 1xx-ish) all count as failures", async () => {
  for (const status of [301, 302, 400, 404, 199]) {
    let n = 0;
    const { d } = setup(async () => (n++, status), tenant({ maxAttempts: 2 }));
    d.offer(hook());
    await flush();
    mock.timers.tick(1000);
    await flush();
    assert.equal(n, 2, `status ${status}`);
  }
});

test("a huge backoff is clamped instead of overflowing setTimeout into an immediate retry", async () => {
  let n = 0;
  const { d } = setup(async () => (n++, 500), tenant({ maxAttempts: 40, initialBackoffMs: 1_000_000 }));
  d.offer(hook());
  await flush();
  // attempt 1 -> retry 1 after 1e6; skip ahead through retries until the 2^31 clamp region
  for (let i = 0; i < 12; i++) {
    mock.timers.tick(2 ** 31 - 1);
    await flush();
  }
  const before = n;
  mock.timers.tick(1000); // an overflowed timer would have fired within 1ms; clamped ones need ~24 days
  await flush();
  assert.equal(n, before);
});

test("a hung destination only consumes this tenant's concurrency; queue bound applies per dispatcher", async () => {
  const release: (() => void)[] = [];
  const { d } = setup(() => new Promise<number>((r) => release.push(() => r(200))), tenant(), { concurrency: 2, maxOutstanding: 3 });
  assert.ok(d.offer(hook("a")));
  assert.ok(d.offer(hook("b")));
  assert.ok(d.offer(hook("c")));
  assert.equal(d.offer(hook("d")), false); // full
  await flush();
  assert.equal(release.length, 2); // only `concurrency` in flight; c is queued
  release.shift()!();
  await flush();
  assert.equal(release.length, 2); // c started
  assert.ok(d.offer(hook("e"))); // capacity is only freed on completion, not on start
  assert.equal(d.offer(hook("f")), false);
});

test("a webhook waiting to retry does not hold a concurrency slot", async () => {
  const seen: string[] = [];
  const { d } = setup(async (_u, w) => (seen.push(w.id), w.id === "bad" ? 500 : 200), tenant(), { concurrency: 1, maxOutstanding: 10 });
  d.offer(hook("bad"));
  d.offer(hook("good"));
  await flush();
  assert.deepEqual(seen, ["bad", "good"]); // good is not stuck behind bad's backoff
});
