import { describe, expect, it } from "vitest";
import { backoffDelayMs, deliverWithRetry, type RelayEvent } from "../src/delivery.ts";

const event: RelayEvent = {
  id: "evt_1",
  tenantId: "acme",
  body: Buffer.from('{"hello":"world"}'),
  contentType: "application/json",
};

const policy = { destination: "http://dest.test/hook", maxAttempts: 4, initialBackoffMs: 100 };

function harness(outcomes: boolean[]) {
  const sent: RelayEvent[] = [];
  const waits: number[] = [];
  return {
    sent,
    waits,
    deps: {
      send: async (_url: string, e: RelayEvent) => {
        sent.push(e);
        return outcomes[sent.length - 1] ?? false;
      },
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    },
  };
}

describe("backoffDelayMs", () => {
  it("waits the initial backoff before the first retry and doubles after that", () => {
    expect([1, 2, 3, 4].map((retry) => backoffDelayMs(250, retry))).toEqual([250, 500, 1000, 2000]);
  });
});

describe("deliverWithRetry", () => {
  it("delivers on the first attempt without waiting", async () => {
    const h = harness([true]);
    const outcome = await deliverWithRetry(event, policy, h.deps);
    expect(outcome).toEqual({ delivered: true, attempts: 1 });
    expect(h.waits).toEqual([]);
  });

  it("stops retrying at the first success", async () => {
    const h = harness([false, false, true]);
    const outcome = await deliverWithRetry(event, policy, h.deps);
    expect(outcome).toEqual({ delivered: true, attempts: 3 });
    expect(h.waits).toEqual([100, 200]);
  });

  it("gives up after maxAttempts, counting the first try", async () => {
    const h = harness([]);
    const outcome = await deliverWithRetry(event, policy, h.deps);
    expect(outcome).toEqual({ delivered: false, attempts: 4 });
    expect(h.waits).toEqual([100, 200, 400]);
  });

  it("sends the same event, and so the same id, on every attempt", async () => {
    const h = harness([false, false, true]);
    await deliverWithRetry(event, policy, h.deps);
    expect(h.sent.map((e) => e.id)).toEqual(["evt_1", "evt_1", "evt_1"]);
  });
});
