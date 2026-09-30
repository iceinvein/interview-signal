import assert from "node:assert/strict";
import { test } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import { backoffMs, TenantQueue, type WebhookEvent } from "../src/delivery.ts";
import { captureLogger, FakeClock, fail500, ok, scriptedSender } from "./helpers.ts";

const config = (over: Partial<TenantConfig> = {}): TenantConfig => ({
  destination: new URL("https://dest.example/hook?token=secret"),
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 10,
  ...over,
});

const event = (id: string): WebhookEvent => ({
  id,
  tenantId: "acme",
  body: Buffer.from(`body-${id}`),
  contentType: "application/json",
});

function setup(respond: Parameters<typeof scriptedSender>[1], over: Partial<TenantConfig> = {}, limits = { concurrency: 4, maxPending: 100 }) {
  const clock = new FakeClock();
  const log = captureLogger();
  const sender = scriptedSender(clock, respond);
  const queue = new TenantQueue("acme", config(over), limits, sender.send, clock, log);
  return { clock, log, queue, ...sender };
}

test("backoff doubles from the initial delay", () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => backoffMs(1000, n)), [1000, 2000, 4000, 8000]);
  assert.equal(backoffMs(0, 5), 0);
});

test("delivers once on 2xx with the event's body, content type and id", async () => {
  const { clock, queue, calls } = setup(() => ok);
  queue.enqueue(event("e1"));
  await clock.advance(60_000);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.webhookId, "e1");
  assert.equal(calls[0]!.contentType, "application/json");
  assert.deepEqual(calls[0]!.body, Buffer.from("body-e1"));
  assert.equal(queue.pending, 0);
});

test("retries at exactly initial, then doubling, intervals and stops at maxAttempts", async () => {
  const { clock, queue, calls, log } = setup(() => fail500, { maxAttempts: 4, initialBackoffMs: 1000 });
  queue.enqueue(event("e1"));

  await clock.advance(999);
  assert.equal(calls.length, 1, "no retry before initialBackoffMs");
  await clock.advance(1);
  assert.equal(calls.length, 2);

  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000, 7000]);
  assert.ok(calls.every((c) => c.webhookId === "e1"), "same id on every attempt");
  assert.equal(queue.pending, 0);
  assert.equal(log.lines.filter((l) => l.msg === "delivery abandoned").length, 1);
});

test("stops retrying as soon as an attempt succeeds", async () => {
  const { clock, queue, calls } = setup((_, n) => (n < 3 ? fail500 : ok), { maxAttempts: 5 });
  queue.enqueue(event("e1"));
  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000]);
});

test("maxAttempts of 1 means no retries", async () => {
  const { clock, queue, calls } = setup(() => fail500, { maxAttempts: 1 });
  queue.enqueue(event("e1"));
  await clock.advance(60_000);
  assert.equal(calls.length, 1);
});

test("connection errors count as failed attempts, as does a sender that throws", async () => {
  const { clock, queue, calls } = setup((_, n) => {
    if (n === 1) return { ok: false, error: "ECONNREFUSED" };
    if (n === 2) throw new Error("bug");
    return ok;
  });
  queue.enqueue(event("e1"));
  await clock.advance(60_000);
  assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000]);
  assert.equal(queue.pending, 0);
});

test("limits in-flight deliveries to the configured concurrency", async () => {
  const { clock, queue, calls, release } = setup(() => "hang", {}, { concurrency: 2, maxPending: 100 });
  for (const id of ["a", "b", "c"]) queue.enqueue(event(id));
  await clock.advance(0);
  assert.deepEqual(calls.map((c) => c.webhookId), ["a", "b"]);

  release();
  await clock.advance(0);
  assert.deepEqual(calls.map((c) => c.webhookId), ["a", "b", "c"]);
});

test("an event waiting to retry does not occupy a concurrency slot", async () => {
  const { clock, queue, calls } = setup((req) => (req.webhookId === "a" ? fail500 : ok), { initialBackoffMs: 10_000 }, {
    concurrency: 1,
    maxPending: 100,
  });
  queue.enqueue(event("a"));
  queue.enqueue(event("b"));
  await clock.advance(0);
  assert.deepEqual(calls.map((c) => [c.webhookId, c.at]), [["a", 0], ["b", 0]]);
});

test("rejects new events once the tenant's backlog is full, and accepts again when it drains", async () => {
  const { clock, queue, release } = setup(() => "hang", {}, { concurrency: 1, maxPending: 2 });
  assert.equal(queue.enqueue(event("a")), true);
  assert.equal(queue.enqueue(event("b")), true);
  assert.equal(queue.enqueue(event("c")), false);

  release();
  await clock.advance(0);
  assert.equal(queue.enqueue(event("d")), true);
});

test("logs never include the body or the destination's path and query", async () => {
  const { clock, queue, log } = setup(() => fail500, { maxAttempts: 2 });
  queue.enqueue(event("e1"));
  await clock.advance(60_000);
  const text = JSON.stringify(log.lines);
  assert.ok(!text.includes("body-e1"));
  assert.ok(!text.includes("secret"));
  assert.ok(text.includes("https://dest.example"));
});
