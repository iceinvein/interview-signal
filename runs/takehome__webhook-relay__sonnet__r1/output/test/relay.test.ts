import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import { Relay } from "../src/relay.ts";
import type { Sender } from "../src/sender.ts";
import { CapturingLogger, FakeClock, flush } from "./helpers.ts";

type Call = { tenant: string; at: number; webhookId: string; url: string; body: string; contentType?: string };

describe("Relay", () => {
  let clock: FakeClock;
  let calls: Call[];
  let respond: (url: string) => Promise<{ status: number }>;

  const cfg = (over: Partial<TenantConfig> = {}): TenantConfig => ({
    destination: "https://a.example/hook",
    maxAttempts: 4,
    initialBackoffMs: 1000,
    requestsPerSecond: 100,
    ...over,
  });

  const send: Sender = async ({ url, body, contentType, webhookId }) => {
    calls.push({ tenant: url, at: clock.now(), webhookId, url, body: body.toString(), contentType });
    return respond(url);
  };

  const makeRelay = (tenants: Record<string, TenantConfig>, maxPendingPerTenant?: number) =>
    new Relay({ tenants: new Map(Object.entries(tenants)), send, clock, logger: new CapturingLogger(), maxPendingPerTenant });

  const hook = { body: Buffer.from("payload"), contentType: "text/plain" };

  beforeEach(() => {
    clock = new FakeClock();
    calls = [];
    respond = async () => ({ status: 200 });
  });

  test("unknown tenant is reported, not delivered", async () => {
    const relay = makeRelay({ a: cfg() });
    assert.deepEqual(relay.accept("nope", hook), { kind: "unknown-tenant" });
    assert.deepEqual(relay.accept("__proto__", hook), { kind: "unknown-tenant" });
    await flush();
    assert.equal(calls.length, 0);
  });

  test("delivers once on 2xx with the same body and content type", async () => {
    const relay = makeRelay({ a: cfg() });
    const r = relay.accept("a", hook);
    await flush();
    assert.equal(r.kind, "accepted");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.body, "payload");
    assert.equal(calls[0]!.contentType, "text/plain");
    assert.equal(relay.pendingCount(), 0);
  });

  test("retries with doubling backoff starting at initialBackoffMs, same id every time", async () => {
    respond = async () => ({ status: 500 });
    const relay = makeRelay({ a: cfg({ maxAttempts: 4, initialBackoffMs: 1000 }) });
    const start = clock.now();
    relay.accept("a", hook);

    await clock.advance(0);
    assert.equal(calls.length, 1);
    await clock.advance(999);
    assert.equal(calls.length, 1, "must not retry before initialBackoffMs");
    await clock.advance(1);
    assert.equal(calls.length, 2);
    await clock.advance(2000);
    assert.equal(calls.length, 3);
    await clock.advance(3999);
    assert.equal(calls.length, 3);
    await clock.advance(1);
    assert.equal(calls.length, 4);

    assert.deepEqual(calls.map((c) => c.at - start), [0, 1000, 3000, 7000]);
    assert.equal(new Set(calls.map((c) => c.webhookId)).size, 1);

    await clock.advance(1_000_000);
    assert.equal(calls.length, 4, "maxAttempts includes the first try");
    assert.equal(relay.pendingCount(), 0);
  });

  test("stops retrying after a 2xx", async () => {
    let n = 0;
    respond = async () => ({ status: ++n < 3 ? 503 : 204 });
    const relay = makeRelay({ a: cfg() });
    relay.accept("a", hook);
    await clock.advance(100_000);
    assert.equal(calls.length, 3);
  });

  test("connection errors and non-2xx (including 3xx and 4xx) are failures", async () => {
    const statuses = [301, 404, 199];
    let i = 0;
    respond = async () => {
      if (i >= statuses.length) throw new Error("ECONNREFUSED");
      return { status: statuses[i++]! };
    };
    const relay = makeRelay({ a: cfg({ maxAttempts: 5, initialBackoffMs: 10 }) });
    relay.accept("a", hook);
    await clock.advance(10_000);
    assert.equal(calls.length, 5);
  });

  test("maxAttempts 1 never retries", async () => {
    respond = async () => ({ status: 500 });
    const relay = makeRelay({ a: cfg({ maxAttempts: 1 }) });
    relay.accept("a", hook);
    await clock.advance(100_000);
    assert.equal(calls.length, 1);
  });

  test("each event gets its own id and its own retry schedule", async () => {
    respond = async () => ({ status: 500 });
    const relay = makeRelay({ a: cfg({ maxAttempts: 2 }) });
    relay.accept("a", hook);
    await clock.advance(500);
    relay.accept("a", hook);
    await clock.advance(10_000);
    assert.equal(calls.length, 4);
    assert.equal(new Set(calls.map((c) => c.webhookId)).size, 2);
  });

  test("rate limit: over-limit webhooks are rejected, not forwarded, and capacity returns", async () => {
    const relay = makeRelay({ a: cfg({ requestsPerSecond: 2 }) });
    assert.equal(relay.accept("a", hook).kind, "accepted");
    assert.equal(relay.accept("a", hook).kind, "accepted");
    assert.deepEqual(relay.accept("a", hook), { kind: "rate-limited", retryAfterSec: 1 });
    await flush();
    assert.equal(calls.length, 2);

    await clock.advance(1000);
    assert.equal(relay.accept("a", hook).kind, "accepted");
  });

  test("Retry-After rounds up to whole seconds", async () => {
    const relay = makeRelay({ a: cfg({ requestsPerSecond: 1 }) });
    relay.accept("a", hook);
    await clock.advance(1);
    assert.deepEqual(relay.accept("a", hook), { kind: "rate-limited", retryAfterSec: 1 });
  });

  test("isolation: a tenant that is rate limited or failing does not affect another", async () => {
    respond = async (url) => (url.includes("bad") ? { status: 500 } : { status: 200 });
    const relay = makeRelay({
      bad: cfg({ destination: "https://bad.example/", requestsPerSecond: 1, maxAttempts: 10 }),
      good: cfg({ destination: "https://good.example/" }),
    });
    relay.accept("bad", hook);
    assert.equal(relay.accept("bad", hook).kind, "rate-limited");

    for (let i = 0; i < 10; i++) assert.equal(relay.accept("good", hook).kind, "accepted");
    await flush();
    assert.equal(calls.filter((c) => c.url.includes("good")).length, 10, "delivered immediately despite bad tenant backing off");
  });

  test("a hung destination does not block other tenants", async () => {
    respond = (url) => (url.includes("hung") ? new Promise(() => {}) : Promise.resolve({ status: 200 }));
    const relay = makeRelay({
      hung: cfg({ destination: "https://hung.example/" }),
      good: cfg({ destination: "https://good.example/" }),
    });
    relay.accept("hung", hook);
    relay.accept("good", hook);
    await flush();
    assert.equal(calls.filter((c) => c.url.includes("good")).length, 1);
  });

  test("pending cap sheds load for that tenant only and does not spend rate-limit budget", async () => {
    respond = async () => ({ status: 500 });
    const relay = makeRelay({ a: cfg({ requestsPerSecond: 3 }), b: cfg() }, 2);
    assert.equal(relay.accept("a", hook).kind, "accepted");
    assert.equal(relay.accept("a", hook).kind, "accepted");
    assert.equal(relay.accept("a", hook).kind, "overloaded");
    assert.equal(relay.accept("b", hook).kind, "accepted");
    assert.equal(relay.pendingCount(), 3);
  });
});
