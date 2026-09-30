import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createRelayServer } from "../src/server.ts";
import { FakeClock } from "./helpers.ts";
import type { Delivery, Tenant } from "../src/types.ts";

const mk = (over: Partial<Tenant> = {}): Tenant => ({
  destination: "http://dest.invalid/",
  maxAttempts: 3,
  initialBackoffMs: 1000,
  requestsPerSecond: 2,
  ...over,
});

async function start(tenants: Record<string, Tenant>, sendImpl?: (d: Delivery) => Promise<number>) {
  const clock = new FakeClock();
  const sent: Delivery[] = [];
  const logs: Record<string, unknown>[] = [];
  const { server, relay } = createRelayServer({
    tenants: new Map(Object.entries(tenants)),
    clock,
    log: (e) => logs.push(e),
    send: async (d) => {
      sent.push(d);
      return sendImpl ? sendImpl(d) : 200;
    },
    maxBodyBytes: 100,
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: string | Buffer = "{}", headers: Record<string, string> = {}) =>
    fetch(base + path, { method: "POST", body: typeof body === "string" ? body : new Uint8Array(body), headers });
  return { clock, sent, logs, relay, post, base, close: () => server.close() && server.closeAllConnections() };
}

test("202 for known tenant; forwards exact bytes, content type and X-Webhook-Id", async (t) => {
  const s = await start({ acme: mk() });
  t.after(s.close);
  const bytes = Buffer.from([0, 255, 1, 128, 10]);
  const res = await s.post("/webhooks/acme", bytes, { "Content-Type": "application/x-weird" });
  assert.equal(res.status, 202);
  await s.relay.idle();
  assert.equal(s.sent.length, 1);
  assert.deepEqual(s.sent[0]!.body, bytes);
  assert.equal(s.sent[0]!.contentType, "application/x-weird");
  assert.match(s.sent[0]!.id, /^[0-9a-f-]{36}$/);
});

test("202 is returned without waiting for delivery", async (t) => {
  const s = await start({ acme: mk() }, () => new Promise(() => {})); // destination hangs forever
  t.after(s.close);
  const res = await s.post("/webhooks/acme");
  assert.equal(res.status, 202);
  assert.equal(s.relay.pending, 1);
});

test("unknown tenants get 404, including prototype property names", async (t) => {
  const s = await start({ acme: mk() });
  t.after(s.close);
  for (const p of ["/webhooks/nope", "/webhooks/constructor", "/webhooks/__proto__", "/other"]) {
    assert.equal((await s.post(p)).status, 404, p);
  }
  assert.equal(s.sent.length, 0);
});

test("rate limit: 429 with Retry-After, not forwarded, recovers after the window", async (t) => {
  const s = await start({ acme: mk({ requestsPerSecond: 2 }) });
  t.after(s.close);
  assert.equal((await s.post("/webhooks/acme")).status, 202);
  assert.equal((await s.post("/webhooks/acme")).status, 202);
  const limited = await s.post("/webhooks/acme");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  await s.relay.idle();
  assert.equal(s.sent.length, 2);
  await s.clock.advance(1000);
  assert.equal((await s.post("/webhooks/acme")).status, 202);
});

test("one tenant's rate limit and failing destination do not affect another", async (t) => {
  const s = await start(
    { noisy: mk({ requestsPerSecond: 1 }), quiet: mk({ requestsPerSecond: 1 }) },
    async (d) => (d.url.includes("dest") ? 500 : 200),
  );
  t.after(s.close);
  assert.equal((await s.post("/webhooks/noisy")).status, 202);
  assert.equal((await s.post("/webhooks/noisy")).status, 429);
  assert.equal((await s.post("/webhooks/quiet")).status, 202);
});

test("oversized body gets 413 and is not forwarded", async (t) => {
  const s = await start({ acme: mk() });
  t.after(s.close);
  const res = await s.post("/webhooks/acme", "x".repeat(1000)).catch(() => null);
  if (res) assert.equal(res.status, 413);
  assert.equal(s.sent.length, 0);
});

test("non-POST gets 405", async (t) => {
  const s = await start({ acme: mk() });
  t.after(s.close);
  assert.equal((await fetch(s.base + "/webhooks/acme")).status, 405);
});

test("logs each request but never the body", async (t) => {
  const s = await start({ acme: mk() });
  t.after(s.close);
  const payload = '{"api_key":"sk_live_SECRET123"}';
  await s.post("/webhooks/acme", payload, { "Content-Type": "application/json" });
  await s.relay.idle();
  const accepted = s.logs.find((l) => l.msg === "webhook accepted");
  assert.ok(accepted);
  assert.equal(accepted.tenant, "acme");
  assert.equal(accepted.bytes, Buffer.byteLength(payload));
  assert.ok(!JSON.stringify(s.logs).includes("SECRET123"));
});
