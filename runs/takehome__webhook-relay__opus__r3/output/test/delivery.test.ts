import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import { backoffMs, TenantDispatcher, type SendOutcome, type Sender } from "../src/delivery.ts";
import { silentLogger } from "../src/logger.ts";
import { FakeClock, settle } from "./fakeClock.ts";

interface Call {
  at: number;
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** A sender that records each call and answers with the next scripted outcome (last one repeats). */
function scriptedSender(clock: FakeClock, outcomes: SendOutcome[]): { sender: Sender; calls: Call[] } {
  const calls: Call[] = [];
  const sender: Sender = async (url, headers, body) => {
    calls.push({ at: clock.now(), url, headers, body });
    return outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
  };
  return { sender, calls };
}

const tenant: TenantConfig = {
  destination: "https://acme.test/hook",
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 100,
};

function dispatcher(clock: FakeClock, sender: Sender, overrides: Partial<TenantConfig> = {}, concurrency = 10) {
  return new TenantDispatcher({ ...tenant, ...overrides }, { clock, sender, logger: silentLogger, concurrency, maxPending: 100 });
}

const webhook = (id: string) => ({ id, tenantId: "acme", body: Buffer.from([0, 1, 2, 255]), contentType: "application/octet-stream" });

describe("backoffMs", () => {
  it("waits initialBackoffMs before the first retry and doubles after", () => {
    assert.deepEqual([1, 2, 3, 4].map((n) => backoffMs(500, n)), [500, 1000, 2000, 4000]);
  });
});

describe("TenantDispatcher", () => {
  it("forwards body, content type and webhook id to the destination", async () => {
    const clock = new FakeClock();
    const { sender, calls } = scriptedSender(clock, [{ ok: true, status: 200 }]);
    const d = dispatcher(clock, sender);
    d.enqueue(webhook("evt-1"));
    await settle();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, tenant.destination);
    assert.deepEqual(calls[0]!.headers, { "x-webhook-id": "evt-1", "content-type": "application/octet-stream" });
    assert.deepEqual(calls[0]!.body, Buffer.from([0, 1, 2, 255]));
    assert.equal(d.pending, 0);
  });

  it("omits Content-Type when the incoming webhook had none", async () => {
    const clock = new FakeClock();
    const { sender, calls } = scriptedSender(clock, [{ ok: true, status: 204 }]);
    dispatcher(clock, sender).enqueue({ ...webhook("evt-1"), contentType: undefined });
    await settle();
    assert.deepEqual(calls[0]!.headers, { "x-webhook-id": "evt-1" });
  });

  it("retries with exponential backoff, same id each time, up to maxAttempts in total", async () => {
    const clock = new FakeClock();
    const { sender, calls } = scriptedSender(clock, [{ ok: false, status: 500 }]);
    const d = dispatcher(clock, sender);
    d.enqueue(webhook("evt-1"));

    await clock.advance(999);
    assert.equal(calls.length, 1, "no retry before initialBackoffMs has elapsed");
    await clock.advance(60_000);

    assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000, 7000]);
    assert.ok(calls.every((c) => c.headers["x-webhook-id"] === "evt-1"));
    assert.equal(d.pending, 0, "abandoned after maxAttempts");
  });

  it("stops retrying once an attempt succeeds", async () => {
    const clock = new FakeClock();
    const { sender, calls } = scriptedSender(clock, [{ ok: false, status: 503 }, { ok: false, error: "ECONNREFUSED" }, { ok: true, status: 201 }]);
    const d = dispatcher(clock, sender);
    d.enqueue(webhook("evt-1"));
    await clock.advance(60_000);

    assert.deepEqual(calls.map((c) => c.at), [0, 1000, 3000]);
    assert.equal(d.pending, 0);
  });

  it("makes exactly one attempt when maxAttempts is 1", async () => {
    const clock = new FakeClock();
    const { sender, calls } = scriptedSender(clock, [{ ok: false, status: 500 }]);
    dispatcher(clock, sender, { maxAttempts: 1 }).enqueue(webhook("evt-1"));
    await clock.advance(60_000);
    assert.equal(calls.length, 1);
  });

  it("does not let an event in backoff block the tenant's other events", async () => {
    const clock = new FakeClock();
    const calls: { id: string; at: number }[] = [];
    const sender: Sender = async (_url, headers) => {
      calls.push({ id: headers["x-webhook-id"]!, at: clock.now() });
      return headers["x-webhook-id"] === "bad" ? { ok: false, status: 500 } : { ok: true, status: 200 };
    };
    const d = dispatcher(clock, sender, {}, 1);
    d.enqueue(webhook("bad"));
    await settle();
    d.enqueue(webhook("good"));
    await settle();

    assert.deepEqual(calls, [{ id: "bad", at: 0 }, { id: "good", at: 0 }]);
  });

  it("caps concurrent requests per tenant and continues as slots free up", async () => {
    const clock = new FakeClock();
    const resolvers: ((o: SendOutcome) => void)[] = [];
    const sender: Sender = () => new Promise((r) => resolvers.push(r));
    const d = dispatcher(clock, sender, {}, 2);
    for (let i = 0; i < 5; i++) d.enqueue(webhook(`evt-${i}`));
    await settle();
    assert.equal(resolvers.length, 2);

    resolvers[0]!({ ok: true, status: 200 });
    await settle();
    assert.equal(resolvers.length, 3);
  });

  it("reports no capacity once maxPending webhooks are unfinished", async () => {
    const clock = new FakeClock();
    const d = new TenantDispatcher(tenant, {
      clock,
      sender: () => new Promise(() => {}),
      logger: silentLogger,
      concurrency: 1,
      maxPending: 2,
    });
    d.enqueue(webhook("a"));
    assert.equal(d.hasCapacity(), true);
    d.enqueue(webhook("b"));
    assert.equal(d.hasCapacity(), false);
  });
});
