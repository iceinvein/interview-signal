import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantDispatcher, type Delivery, type Sender } from "../src/dispatcher.ts";

/** Manual clock: timers fire only when the test calls advance(). */
class FakeTimers {
  now = 0;
  private timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  setTimer = (fn: () => void, ms: number) => {
    const timer = { at: this.now + ms, fn, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  get pending() {
    return this.timers.filter((t) => !t.cancelled).length;
  }
  async advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers.splice(this.timers.indexOf(due), 1);
      this.now = due.at;
      due.fn();
      await flush();
    }
    this.now = target;
  }
}

const flush = () => new Promise<void>((r) => setImmediate(r));
const delivery = (id = "evt-1", size = 3): Delivery => ({ id, body: Buffer.alloc(size), contentType: "text/plain" });

function setup(opts: { send: Sender; maxAttempts?: number; backoff?: number; concurrency?: number; maxQueuedBytes?: number }) {
  const timers = new FakeTimers();
  const dispatcher = new TenantDispatcher({
    tenantId: "t",
    config: {
      destination: "http://dest.invalid/",
      maxAttempts: opts.maxAttempts ?? 5,
      initialBackoffMs: opts.backoff ?? 1000,
      requestsPerSecond: 100,
    },
    send: opts.send,
    setTimer: timers.setTimer,
    log: () => {},
    concurrency: opts.concurrency ?? 8,
    maxQueuedBytes: opts.maxQueuedBytes ?? 1_000_000,
  });
  return { timers, dispatcher };
}

test("2xx on first try: sent once, nothing scheduled", async () => {
  const calls: string[] = [];
  const { dispatcher, timers } = setup({ send: async (_d, d) => (calls.push(d.id), 204) });
  dispatcher.enqueue(delivery());
  await flush();
  assert.deepEqual(calls, ["evt-1"]);
  assert.equal(timers.pending, 0);
});

test("backoff doubles: waits 1000, 2000, 4000 between attempts; id is stable", async () => {
  const attempts: { at: number; id: string }[] = [];
  let timersRef: FakeTimers;
  const { dispatcher, timers } = setup({
    backoff: 1000,
    maxAttempts: 4,
    send: async (_d, d) => (attempts.push({ at: timersRef.now, id: d.id }), 500),
  });
  timersRef = timers;
  dispatcher.enqueue(delivery("same-id"));
  await flush();
  assert.equal(attempts.length, 1);

  await timers.advance(999);
  assert.equal(attempts.length, 1, "no retry before initialBackoffMs");
  await timers.advance(1);
  assert.equal(attempts.length, 2);

  await timers.advance(1999);
  assert.equal(attempts.length, 2);
  await timers.advance(1);
  assert.equal(attempts.length, 3);

  await timers.advance(3999);
  assert.equal(attempts.length, 3);
  await timers.advance(1);
  assert.equal(attempts.length, 4);

  assert.deepEqual(attempts.map((a) => a.at), [0, 1000, 3000, 7000]);
  assert.ok(attempts.every((a) => a.id === "same-id"));

  await timers.advance(1_000_000);
  assert.equal(attempts.length, 4, "maxAttempts includes the first try; no more after that");
  assert.equal(timers.pending, 0);
});

test("connection errors count as failed attempts and are retried", async () => {
  let n = 0;
  const { dispatcher, timers } = setup({
    send: async () => {
      if (++n < 3) throw new Error("ECONNREFUSED");
      return 200;
    },
  });
  dispatcher.enqueue(delivery());
  await flush();
  await timers.advance(1000 + 2000);
  assert.equal(n, 3);
  assert.equal(timers.pending, 0);
});

test("non-2xx (3xx, 4xx) is a failure", async () => {
  const statuses = [301, 404, 199];
  let n = 0;
  const { dispatcher, timers } = setup({ maxAttempts: 3, send: async () => statuses[n++]! });
  dispatcher.enqueue(delivery());
  await flush();
  await timers.advance(10_000);
  assert.equal(n, 3);
});

test("maxAttempts 1 never retries", async () => {
  let n = 0;
  const { dispatcher, timers } = setup({ maxAttempts: 1, send: async () => (n++, 500) });
  dispatcher.enqueue(delivery());
  await flush();
  assert.equal(timers.pending, 0);
  assert.equal(n, 1);
});

test("an event waiting out a backoff does not block newer events", async () => {
  const sent: string[] = [];
  const { dispatcher, timers } = setup({
    concurrency: 1,
    send: async (_d, d) => (sent.push(d.id), d.id === "bad" ? 500 : 200),
  });
  dispatcher.enqueue(delivery("bad"));
  await flush();
  dispatcher.enqueue(delivery("good"));
  await flush();
  assert.deepEqual(sent, ["bad", "good"]);
  assert.equal(timers.pending, 1);
});

test("concurrency is capped per tenant", async () => {
  let active = 0;
  let peak = 0;
  const releases: (() => void)[] = [];
  const { dispatcher } = setup({
    concurrency: 2,
    send: () => {
      peak = Math.max(peak, ++active);
      return new Promise((resolve) => releases.push(() => (active--, resolve(200))));
    },
  });
  for (let i = 0; i < 5; i++) dispatcher.enqueue(delivery(`e${i}`));
  await flush();
  assert.equal(active, 2);
  releases.shift()!();
  await flush();
  assert.equal(active, 2);
  assert.equal(peak, 2);
});

test("one tenant's hung destination does not affect another tenant", async () => {
  const sentB: string[] = [];
  const a = setup({ send: () => new Promise(() => {}), concurrency: 1 });
  const b = setup({ send: async (_d, d) => (sentB.push(d.id), 200) });
  a.dispatcher.enqueue(delivery("a1"));
  a.dispatcher.enqueue(delivery("a2"));
  b.dispatcher.enqueue(delivery("b1"));
  await flush();
  assert.deepEqual(sentB, ["b1"]);
});

test("backlog capacity is bounded and freed after delivery", async () => {
  const { dispatcher, timers } = setup({
    maxAttempts: 2,
    maxQueuedBytes: 3000,
    send: async () => 500,
  });
  assert.equal(dispatcher.hasCapacity(100), true);
  dispatcher.enqueue(delivery("a", 1000)); // cost 2024, waiting on retry
  await flush();
  assert.equal(dispatcher.hasCapacity(1000), false);
  await timers.advance(1000); // second attempt fails -> gives up -> released
  assert.equal(dispatcher.hasCapacity(1000), true);
});

test("close cancels pending retries", async () => {
  let n = 0;
  const { dispatcher, timers } = setup({ send: async () => (n++, 500) });
  dispatcher.enqueue(delivery());
  await flush();
  dispatcher.close();
  await timers.advance(100_000);
  assert.equal(n, 1);
});
