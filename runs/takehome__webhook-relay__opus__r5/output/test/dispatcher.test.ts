import assert from "node:assert/strict";
import { test } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import { TenantDispatcher, type DeliveryEvent, type Webhook } from "../src/dispatcher.ts";
import { FakeTime, settle } from "./fake-time.ts";

const config: TenantConfig = {
  destination: new URL("https://dest.example/hook"),
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 10,
};

function webhook(id: string): Webhook {
  return { id, tenantId: "acme", body: Buffer.from("{}"), contentType: "application/json" };
}

/** Sender that answers each call with the next scripted result (a status, or an Error to throw). */
function scriptedSender(results: (number | Error)[]) {
  const calls: { at: number; id: string }[] = [];
  return {
    calls,
    bind(time: FakeTime) {
      return async (_url: URL, w: Webhook) => {
        calls.push({ at: time.now, id: w.id });
        const next = results.shift() ?? 200;
        if (next instanceof Error) throw next;
        return next;
      };
    },
  };
}

function setup(results: (number | Error)[], overrides: Partial<TenantConfig> = {}) {
  const time = new FakeTime();
  const sender = scriptedSender(results);
  const events: DeliveryEvent[] = [];
  const dispatcher = new TenantDispatcher(
    { ...config, ...overrides },
    {
      send: sender.bind(time),
      schedule: time.schedule,
      onEvent: (e) => events.push(e),
      maxConcurrency: 10,
      maxPending: 100,
    },
  );
  return { time, calls: sender.calls, events, dispatcher };
}

test("retries with exponential backoff and a stable id until delivered", async () => {
  const { time, calls, events, dispatcher } = setup([500, new Error("ECONNREFUSED"), 503, 200]);
  dispatcher.enqueue(webhook("wh-1"));
  await time.advance(60_000);

  assert.deepEqual(
    calls.map((c) => c.at),
    [0, 1000, 3000, 7000],
    "waits 1s, then 2s, then 4s",
  );
  assert.ok(calls.every((c) => c.id === "wh-1"));
  assert.deepEqual(
    events.map((e) => e.outcome),
    ["retrying", "retrying", "retrying", "delivered"],
  );
  assert.equal(dispatcher.pending, 0);
});

test("does not retry before the backoff has elapsed", async () => {
  const { time, calls, dispatcher } = setup([500, 500, 200]);
  dispatcher.enqueue(webhook("wh-1"));
  await time.advance(999);
  assert.equal(calls.length, 1);
  await time.advance(1);
  assert.equal(calls.length, 2);
  await time.advance(1999);
  assert.equal(calls.length, 2);
  await time.advance(1);
  assert.equal(calls.length, 3);
});

test("gives up after maxAttempts, counting the first try", async () => {
  const { time, calls, events, dispatcher } = setup([500, 500, 500, 500, 500], { maxAttempts: 3 });
  dispatcher.enqueue(webhook("wh-1"));
  await time.advance(60_000);
  assert.equal(calls.length, 3);
  assert.equal(events.at(-1)?.outcome, "gave_up");
  assert.equal(time.pendingTimers, 0);
  assert.equal(dispatcher.pending, 0);
});

test("maxAttempts of 1 means no retries", async () => {
  const { time, calls, events, dispatcher } = setup([500], { maxAttempts: 1 });
  dispatcher.enqueue(webhook("wh-1"));
  await time.advance(60_000);
  assert.equal(calls.length, 1);
  assert.equal(events[0]?.outcome, "gave_up");
});

test("any 2xx is delivered; 3xx and 4xx are failures", async () => {
  for (const [status, delivered] of [[204, true], [299, true], [302, false], [404, false]] as const) {
    const { time, events, dispatcher } = setup([status], { maxAttempts: 1 });
    dispatcher.enqueue(webhook("wh"));
    await time.advance(0);
    assert.equal(events[0]?.outcome, delivered ? "delivered" : "gave_up", `status ${status}`);
  }
});

test("caps in-flight attempts and backlog per tenant", async () => {
  const release: (() => void)[] = [];
  let started = 0;
  const dispatcher = new TenantDispatcher(config, {
    send: () => {
      started++;
      return new Promise((resolve) => release.push(() => resolve(200)));
    },
    maxConcurrency: 2,
    maxPending: 3,
  });
  assert.ok(dispatcher.enqueue(webhook("a")));
  assert.ok(dispatcher.enqueue(webhook("b")));
  assert.ok(dispatcher.enqueue(webhook("c")));
  assert.equal(dispatcher.enqueue(webhook("d")), false, "backlog full");
  assert.equal(started, 2, "only two in flight");

  release.shift()!();
  await settle();
  assert.equal(started, 3, "next one starts when a slot frees");
  assert.ok(dispatcher.enqueue(webhook("e")), "backlog has room again");
});
