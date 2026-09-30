import { test } from "node:test";
import assert from "node:assert/strict";
import { Deliverer, type Job } from "../src/delivery.ts";
import { silentLogger } from "../src/logger.ts";
import type { OutboundWebhook, Sender } from "../src/sender.ts";
import { FakeClock, tenant } from "./helpers.ts";

const job = (over = {}): Job => ({
  id: "evt-1",
  tenantId: "acme",
  tenant: tenant(over),
  body: Buffer.from("hi"),
  contentType: "text/plain",
});

function setup(responses: (number | Error)[]) {
  const clock = new FakeClock();
  const calls: { at: number; req: OutboundWebhook }[] = [];
  const send: Sender = async (req) => {
    calls.push({ at: clock.now(), req });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    return { status: r };
  };
  return { clock, calls, d: new Deliverer(send, clock, silentLogger) };
}

test("2xx on first try: one attempt, no retry timer", async () => {
  const { d, calls, clock } = setup([204]);
  await d.run(job());
  assert.equal(calls.length, 1);
  assert.equal(clock.pendingTimers, 0);
});

test("backoff waits initialBackoffMs then doubles each retry", async () => {
  const { d, calls, clock } = setup([500]);
  void d.run(job({ maxAttempts: 4, initialBackoffMs: 1000 }));
  await clock.advance(10_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000, 7000]);
});

test("does not retry early", async () => {
  const { d, calls, clock } = setup([500]);
  void d.run(job());
  await clock.advance(999);
  assert.equal(calls.length, 1);
  await clock.advance(1);
  assert.equal(calls.length, 2);
});

test("maxAttempts counts the first try, and the run then settles", async () => {
  const { d, calls, clock } = setup([503]);
  let settled = false;
  void d.run(job({ maxAttempts: 3 })).then(() => (settled = true));
  await clock.advance(100_000);
  assert.equal(calls.length, 3);
  assert.equal(settled, true);
  assert.equal(clock.pendingTimers, 0);
});

test("maxAttempts 1 never retries", async () => {
  const { d, calls, clock } = setup([500]);
  void d.run(job({ maxAttempts: 1 }));
  await clock.advance(100_000);
  assert.equal(calls.length, 1);
});

test("connection errors are failed attempts; stops after a later 2xx", async () => {
  const { d, calls, clock } = setup([new Error("ECONNREFUSED"), 302, 200, 500]);
  void d.run(job({ maxAttempts: 10 }));
  await clock.advance(100_000);
  assert.equal(calls.length, 3); // error, 302 (non-2xx), 200 -> stop
});

test("same webhook id, body and content type on every attempt", async () => {
  const { d, calls, clock } = setup([500]);
  void d.run(job({ maxAttempts: 3 }));
  await clock.advance(100_000);
  assert.equal(new Set(calls.map((c) => c.req.id)).size, 1);
  assert.ok(calls.every((c) => c.req.body.toString() === "hi" && c.req.contentType === "text/plain"));
});

test("a stuck job does not delay another job", async () => {
  const clock = new FakeClock();
  const finished: string[] = [];
  const send: Sender = (req) =>
    req.id === "stuck" ? new Promise(() => {}) : Promise.resolve({ status: 200 });
  const d = new Deliverer(send, clock, silentLogger);
  void d.run({ ...job(), id: "stuck" });
  await d.run({ ...job(), id: "fine" }).then(() => finished.push("fine"));
  assert.deepEqual(finished, ["fine"]);
});
