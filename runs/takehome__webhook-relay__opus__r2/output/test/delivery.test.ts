import assert from "node:assert/strict";
import { test } from "node:test";
import type { TenantConfig } from "../src/config.ts";
import { backoffMs, TenantDeliveryQueue, type OutboundRequest, type Webhook } from "../src/delivery.ts";
import { silentLogger } from "../src/logger.ts";

const config: TenantConfig = {
  destination: new URL("https://dest.example/hook"),
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 10,
};

function webhook(id = "wh-1"): Webhook {
  return { id, tenantId: "acme", body: Buffer.from([0, 1, 2, 255]), contentType: "application/octet-stream" };
}

/** Sender that replays a script of outcomes (status code, or an Error to throw). */
function harness(outcomes: Array<number | Error>, overrides: Partial<TenantConfig> = {}) {
  const requests: OutboundRequest[] = [];
  const sleeps: number[] = [];
  const queue = new TenantDeliveryQueue("acme", { ...config, ...overrides }, {
    send: async (request) => {
      requests.push(request);
      const outcome = outcomes.shift() ?? 500;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    // Time is fully simulated: we record what the queue asked to wait and return at once.
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    logger: silentLogger,
    limits: { maxConcurrent: 2, maxPending: 100 },
  });
  return { queue, requests, sleeps };
}

test("backoff doubles from the initial value", () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => backoffMs(250, n)), [250, 500, 1000, 2000]);
});

test("delivers once on a 2xx and does not retry", async () => {
  const { queue, requests, sleeps } = harness([204]);
  queue.enqueue(webhook());
  await queue.whenIdle();
  assert.equal(requests.length, 1);
  assert.deepEqual(sleeps, []);
});

test("forwards the body, content type and webhook id", async () => {
  const { queue, requests } = harness([200]);
  queue.enqueue(webhook());
  await queue.whenIdle();
  const [request] = requests;
  assert.equal(request!.url.href, "https://dest.example/hook");
  assert.deepEqual(request!.body, Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(request!.headers, {
    "x-webhook-id": "wh-1",
    "content-type": "application/octet-stream",
  });
});

test("omits content-type when the incoming webhook had none", async () => {
  const { queue, requests } = harness([200]);
  queue.enqueue({ ...webhook(), contentType: undefined });
  await queue.whenIdle();
  assert.deepEqual(requests[0]!.headers, { "x-webhook-id": "wh-1" });
});

test("retries with exponential backoff and gives up after maxAttempts in total", async () => {
  const { queue, requests, sleeps } = harness([500, 502, 503, 500, 200]);
  queue.enqueue(webhook());
  await queue.whenIdle();
  assert.equal(requests.length, 4, "maxAttempts includes the first try");
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
});

test("stops retrying as soon as an attempt succeeds", async () => {
  const { queue, requests, sleeps } = harness([500, 500, 201]);
  queue.enqueue(webhook());
  await queue.whenIdle();
  assert.equal(requests.length, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("keeps the same webhook id and body on every retry", async () => {
  const { queue, requests } = harness([500, 500, 200]);
  queue.enqueue(webhook("stable-id"));
  await queue.whenIdle();
  assert.deepEqual(new Set(requests.map((r) => r.headers["x-webhook-id"])), new Set(["stable-id"]));
  for (const r of requests) assert.deepEqual(r.body, Buffer.from([0, 1, 2, 255]));
});

test("treats connection errors, redirects and 4xx as failed attempts", async () => {
  const { queue, requests, sleeps } = harness([new TypeError("fetch failed"), 301, 404, 200]);
  queue.enqueue(webhook());
  await queue.whenIdle();
  assert.equal(requests.length, 4);
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
});

test("maxAttempts of 1 means no retries", async () => {
  const { queue, requests, sleeps } = harness([500], { maxAttempts: 1 });
  queue.enqueue(webhook());
  await queue.whenIdle();
  assert.equal(requests.length, 1);
  assert.deepEqual(sleeps, []);
});

test("caps concurrent attempts per tenant and releases slots during backoff", async () => {
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const retrying = Promise.withResolvers<void>();
  const queue = new TenantDeliveryQueue("acme", config, {
    send: async (request) => {
      active++;
      peak = Math.max(peak, active);
      if (request.headers["x-webhook-id"] === "fails-once" && !releases.length) {
        active--;
        return 500;
      }
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return 200;
    },
    // Holding the retry here proves the failed webhook no longer occupies a slot.
    sleep: () => {
      retrying.resolve();
      return new Promise(() => {});
    },
    logger: silentLogger,
    limits: { maxConcurrent: 2, maxPending: 100 },
  });

  queue.enqueue(webhook("fails-once"));
  await retrying.promise;
  for (const id of ["a", "b", "c"]) queue.enqueue(webhook(id));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(releases.length, 2, "two attempts in flight, the third waits for a slot");
  releases.shift()!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(releases.length, 2, "freed slot is handed to the waiting webhook");
  assert.equal(peak, 2);
});

test("refuses new webhooks once the tenant's backlog is full", () => {
  const queue = new TenantDeliveryQueue("acme", config, {
    send: () => new Promise(() => {}),
    sleep: async () => {},
    logger: silentLogger,
    limits: { maxConcurrent: 1, maxPending: 2 },
  });
  assert.equal(queue.enqueue(webhook("1")), true);
  assert.equal(queue.enqueue(webhook("2")), true);
  assert.equal(queue.enqueue(webhook("3")), false);
  assert.equal(queue.pending, 2);
});
