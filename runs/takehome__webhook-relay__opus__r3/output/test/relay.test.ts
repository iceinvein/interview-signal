import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import type { Sender } from "../src/delivery.ts";
import { silentLogger } from "../src/logger.ts";
import { Relay } from "../src/relay.ts";
import { FakeClock, settle } from "./fakeClock.ts";

const base: TenantConfig = { destination: "", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 2 };

function setup(sender: Sender, maxPendingPerTenant = 100) {
  const clock = new FakeClock();
  const tenants = new Map([
    ["slow", { ...base, destination: "https://slow.test/" }],
    ["fast", { ...base, destination: "https://fast.test/" }],
  ]);
  let n = 0;
  const relay = new Relay(tenants, {
    clock,
    sender,
    logger: silentLogger,
    concurrencyPerTenant: 2,
    maxPendingPerTenant,
    idGenerator: () => `id-${++n}`,
  });
  return { clock, relay };
}

const body = Buffer.from("{}");

describe("Relay", () => {
  it("rejects unknown tenants", () => {
    const { relay } = setup(async () => ({ ok: true, status: 200 }));
    assert.deepEqual(relay.accept("nope", body, undefined), { kind: "unknown_tenant" });
  });

  it("rate limits per tenant without affecting other tenants", async () => {
    const { relay, clock } = setup(async () => ({ ok: true, status: 200 }));
    assert.equal(relay.accept("slow", body, undefined).kind, "accepted");
    await clock.advance(250);
    assert.equal(relay.accept("slow", body, undefined).kind, "accepted");
    assert.deepEqual(relay.accept("slow", body, undefined), { kind: "rate_limited", retryAfterMs: 750 });

    assert.equal(relay.accept("fast", body, undefined).kind, "accepted");
    assert.equal(relay.accept("fast", body, undefined).kind, "accepted");
  });

  it("a hung destination does not delay another tenant's deliveries", async () => {
    const delivered: string[] = [];
    const { relay, clock } = setup(async (url, headers) => {
      if (url.includes("slow")) return new Promise(() => {}); // never answers
      delivered.push(headers["x-webhook-id"]!);
      return { ok: true, status: 200 };
    });
    for (let i = 0; i < 2; i++) relay.accept("slow", body, undefined);
    await clock.advance(1000);
    for (let i = 0; i < 2; i++) relay.accept("slow", body, undefined); // queued behind the hung ones
    relay.accept("fast", body, undefined);
    await settle();
    assert.deepEqual(delivered, ["id-5"]);
  });

  it("returns backlog_full when a tenant's unfinished deliveries reach the cap", () => {
    const { relay } = setup(() => new Promise(() => {}), 1);
    assert.equal(relay.accept("slow", body, undefined).kind, "accepted");
    assert.deepEqual(relay.accept("slow", body, undefined), { kind: "backlog_full" });
    assert.equal(relay.accept("fast", body, undefined).kind, "accepted");
  });
});
