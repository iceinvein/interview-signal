import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { TenantConfig, Tenants } from "../src/config.ts";
import { systemClock } from "../src/clock.ts";
import { Relay } from "../src/relay.ts";
import { httpSender } from "../src/sender.ts";
import { createApp } from "../src/server.ts";
import type { Logger } from "../src/logger.ts";
import { FakeClock } from "./helpers.ts";

const servers: { close(): void; closeAllConnections(): void }[] = [];
after(() => servers.forEach((s) => (s.closeAllConnections(), s.close())));

const listen = (s: ReturnType<typeof createServer>) =>
  new Promise<string>((res) => {
    servers.push(s);
    s.listen(0, "127.0.0.1", () => res(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
  });

interface Received { headers: IncomingMessage["headers"]; body: Buffer }

async function destination(handler: (n: number) => number | "hang") {
  const received: Received[] = [];
  const url = await listen(
    createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks) });
        const r = handler(received.length);
        if (r === "hang") return;
        res.writeHead(r).end();
      });
    }),
  );
  return { url, received };
}

async function relay(tenants: Record<string, Partial<TenantConfig> & { destination: string }>, clock = systemClock) {
  const logs: { event: string; [k: string]: unknown }[] = [];
  const log: Logger = (event, f) => void logs.push({ event, ...f });
  const map: Tenants = new Map(
    Object.entries(tenants).map(([id, t]) => [id, { maxAttempts: 3, initialBackoffMs: 5, requestsPerSecond: 100, ...t }]),
  );
  const base = await listen(createApp(new Relay(map, httpSender(500), clock, log), log));
  return { base, logs, post: (id: string, body: string | Uint8Array<ArrayBuffer>, type?: string) =>
    fetch(`${base}/webhooks/${id}`, { method: "POST", body, headers: type ? { "content-type": type } : {} }) };
}

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) assert.fail("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
};

test("202, forwards exact bytes and content type with X-Webhook-Id", async () => {
  const dest = await destination(() => 200);
  const r = await relay({ acme: { destination: dest.url } });
  const body = Buffer.from([0, 255, 1, 2, 128]);
  const res = await r.post("acme", body, "application/x-custom");
  assert.equal(res.status, 202);
  await until(() => dest.received.length === 1);
  const got = dest.received[0]!;
  assert.deepEqual(got.body, body);
  assert.equal(got.headers["content-type"], "application/x-custom");
  assert.equal(got.headers["x-webhook-id"], res.headers.get("x-webhook-id"));
});

test("unknown tenant (including prototype names) gets 404", async () => {
  const r = await relay({ acme: { destination: "http://127.0.0.1:1" } });
  for (const id of ["nobody", "constructor", "__proto__"]) assert.equal((await r.post(id, "x")).status, 404);
});

test("202 is returned without waiting for a hanging destination", async () => {
  const dest = await destination(() => "hang");
  const r = await relay({ acme: { destination: dest.url } });
  const t0 = Date.now();
  assert.equal((await r.post("acme", "x")).status, 202);
  assert.ok(Date.now() - t0 < 400);
});

test("retries with the same X-Webhook-Id until 2xx", async () => {
  const dest = await destination((n) => (n < 3 ? 500 : 200));
  const r = await relay({ acme: { destination: dest.url, maxAttempts: 5 } });
  await r.post("acme", "payload", "text/plain");
  await until(() => dest.received.length === 3);
  await until(() => r.logs.some((l) => l.event === "delivered"));
  assert.equal(new Set(dest.received.map((x) => x.headers["x-webhook-id"])).size, 1);
  assert.ok(dest.received.every((x) => x.body.toString() === "payload"));
});

test("stops after maxAttempts", async () => {
  const dest = await destination(() => 500);
  const r = await relay({ acme: { destination: dest.url, maxAttempts: 2 } });
  await r.post("acme", "x");
  await until(() => r.logs.some((l) => l.event === "gave_up"));
  assert.equal(dest.received.length, 2);
});

test("429 with Retry-After over the limit; over-limit webhooks are not forwarded; window is time-driven", async () => {
  const dest = await destination(() => 200);
  const clock = new FakeClock();
  const r = await relay({ acme: { destination: dest.url, requestsPerSecond: 2 } }, clock);
  assert.equal((await r.post("acme", "1")).status, 202);
  assert.equal((await r.post("acme", "2")).status, 202);
  const limited = await r.post("acme", "3");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  await until(() => dest.received.length === 2);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(dest.received.length, 2);
  await clock.advance(1000);
  assert.equal((await r.post("acme", "4")).status, 202);
});

test("tenant isolation: a hanging destination and a rate-limited tenant don't affect others", async () => {
  const stuck = await destination(() => "hang");
  const ok = await destination(() => 200);
  const r = await relay({
    slow: { destination: stuck.url, requestsPerSecond: 1 },
    fast: { destination: ok.url },
  });
  assert.equal((await r.post("slow", "a")).status, 202);
  assert.equal((await r.post("slow", "b")).status, 429);
  for (let i = 0; i < 10; i++) assert.equal((await r.post("fast", `m${i}`)).status, 202);
  await until(() => ok.received.length === 10);
});

test("per-tenant backlog cap rejects only that tenant", async () => {
  const stuck = await destination(() => "hang");
  const ok = await destination(() => 200);
  const logs: string[] = [];
  const tenants: Tenants = new Map([
    ["slow", { destination: stuck.url, maxAttempts: 1, initialBackoffMs: 1, requestsPerSecond: 1000 }],
    ["fast", { destination: ok.url, maxAttempts: 1, initialBackoffMs: 1, requestsPerSecond: 1000 }],
  ]);
  const base = await listen(createApp(new Relay(tenants, httpSender(5000), systemClock, () => {}, { maxPendingPerTenant: 2 }), () => void logs.push("")));
  const post = (id: string) => fetch(`${base}/webhooks/${id}`, { method: "POST", body: "x" });
  assert.equal((await post("slow")).status, 202);
  assert.equal((await post("slow")).status, 202);
  assert.equal((await post("slow")).status, 503);
  assert.equal((await post("fast")).status, 202);
});

test("oversized body gets 413 and nothing is forwarded", async () => {
  const dest = await destination(() => 200);
  const r = await relay({ acme: { destination: dest.url } });
  const res = await r.post("acme", Buffer.alloc(2 * 1024 * 1024)).catch(() => undefined);
  if (res) assert.equal(res.status, 413);
  await new Promise((s) => setTimeout(s, 50));
  assert.equal(dest.received.length, 0);
});

test("logs each request but never the body", async () => {
  const dest = await destination(() => 200);
  const r = await relay({ acme: { destination: dest.url } });
  const payload = JSON.stringify({ api_key: "sk_live_SECRET123" });
  await r.post("acme", payload, "application/json");
  await until(() => r.logs.some((l) => l.event === "delivered"));
  const accepted = r.logs.find((l) => l.event === "webhook_accepted")!;
  assert.equal(accepted.tenant, "acme");
  assert.equal(accepted.bytes, Buffer.byteLength(payload));
  assert.ok(!JSON.stringify(r.logs).includes("SECRET123"));
});
