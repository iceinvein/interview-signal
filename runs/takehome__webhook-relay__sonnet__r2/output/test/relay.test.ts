import { test } from "node:test";
import assert from "node:assert/strict";
import { Relay } from "../src/relay.ts";
import { FakeClock } from "./helpers.ts";
import type { Delivery, Tenant } from "../src/types.ts";

const tenant: Tenant = {
  destination: "http://dest.invalid/",
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 10,
};
const delivery = (id = "evt-1"): Delivery => ({
  id,
  url: tenant.destination,
  body: Buffer.from("x"),
  contentType: "text/plain",
});

function setup(statuses: (number | Error)[]) {
  const clock = new FakeClock();
  const attempts: { at: number; id: string }[] = [];
  const logs: Record<string, unknown>[] = [];
  const send = async (d: Delivery) => {
    attempts.push({ at: clock.now(), id: d.id });
    const next = statuses[attempts.length - 1] ?? 500;
    if (next instanceof Error) throw next;
    return next;
  };
  const relay = new Relay(send, clock, (e) => logs.push(e));
  return { clock, attempts, logs, relay };
}

test("delivers immediately on 2xx and never retries", async () => {
  const { clock, attempts, relay } = setup([204]);
  relay.enqueue("t", tenant, delivery());
  await clock.advance(60_000);
  assert.equal(attempts.length, 1);
  assert.equal(relay.pending, 0);
});

test("retries at initial, then doubled waits; maxAttempts includes the first try", async () => {
  const { clock, attempts, relay } = setup([500, new Error("ECONNREFUSED"), 503, 500]);
  relay.enqueue("t", tenant, delivery());
  await clock.advance(100_000);
  // t=0, +1000, +2000, +4000
  assert.deepEqual(attempts.map((a) => a.at), [0, 1000, 3000, 7000]);
  assert.equal(relay.pending, 0);
});

test("does not retry early", async () => {
  const { clock, attempts, relay } = setup([500, 200]);
  relay.enqueue("t", tenant, delivery());
  await clock.advance(999);
  assert.equal(attempts.length, 1);
  await clock.advance(1);
  assert.equal(attempts.length, 2);
  assert.equal(relay.pending, 0);
});

test("stops as soon as a retry succeeds", async () => {
  const { clock, attempts, relay } = setup([500, 500, 201]);
  relay.enqueue("t", tenant, delivery());
  await clock.advance(100_000);
  assert.equal(attempts.length, 3);
});

test("non-2xx codes (3xx, 4xx) are failures", async () => {
  const { clock, attempts, relay } = setup([302, 404, 199, 200]);
  relay.enqueue("t", tenant, delivery());
  await clock.advance(100_000);
  assert.equal(attempts.length, 4);
});

test("maxAttempts 1 means no retry", async () => {
  const { clock, attempts, relay } = setup([500]);
  relay.enqueue("t", { ...tenant, maxAttempts: 1 }, delivery());
  await clock.advance(100_000);
  assert.equal(attempts.length, 1);
});

test("the same id is used on every attempt", async () => {
  const { clock, attempts, relay } = setup([500, 500, 200]);
  relay.enqueue("t", tenant, delivery("abc"));
  await clock.advance(100_000);
  assert.deepEqual(new Set(attempts.map((a) => a.id)), new Set(["abc"]));
});

test("a failing event does not delay other events", async () => {
  const { clock, attempts, relay } = setup([500]);
  relay.enqueue("t", tenant, delivery("bad"));
  await clock.settle();
  relay.enqueue("t", tenant, delivery("good")); // 500 default too, but sent right away
  await clock.settle();
  assert.deepEqual(attempts.map((a) => [a.id, a.at]), [["bad", 0], ["good", 0]]);
});
