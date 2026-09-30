import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRelay, type RelayOptions } from "../src/relay.ts";
import type { Send, Webhook } from "../src/dispatcher.ts";
import { listen, tenant } from "../support/helpers.ts";

const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(over: Partial<RelayOptions> & { sent?: { dest: string; w: Webhook }[] } = {}) {
  const sent = over.sent ?? [];
  const send: Send = async (dest, w) => (sent.push({ dest, w }), 200);
  const logs: Record<string, unknown>[] = [];
  const server = createRelay({
    tenants: new Map([
      ["acme", tenant({ destination: "http://acme.invalid/", requestsPerSecond: 2 })],
      ["other", tenant({ destination: "http://other.invalid/", requestsPerSecond: 2 })],
    ]),
    send,
    log: (e) => logs.push(e),
    ...over,
  });
  servers.push(server);
  return { base: await listen(server), sent, logs };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test("202, forwards identical bytes and content-type, id matches X-Webhook-Id response", async () => {
  const { base, sent } = await start();
  const body = Buffer.from([0, 255, 1, 2, 128, 0]); // not valid UTF-8
  const res = await fetch(`${base}/webhooks/acme`, { method: "POST", body, headers: { "Content-Type": "application/x-weird" } });
  assert.equal(res.status, 202);
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.dest, "http://acme.invalid/");
  assert.deepEqual(sent[0]!.w.body, body);
  assert.equal(sent[0]!.w.contentType, "application/x-weird");
  assert.equal(sent[0]!.w.id, res.headers.get("x-webhook-id"));
});

test("unknown tenant, including prototype names, gets 404", async () => {
  const { base, sent } = await start();
  for (const id of ["nobody", "constructor", "__proto__", "toString", "%zz", ""]) {
    const res = await fetch(`${base}/webhooks/${id}`, { method: "POST", body: "x" });
    assert.equal(res.status, 404, id);
  }
  assert.equal(sent.length, 0);
});

test("non-POST is 405", async () => {
  const { base } = await start();
  assert.equal((await fetch(`${base}/webhooks/acme`)).status, 405);
});

test("over the limit: 429 with Retry-After, not forwarded; window slides with time", async () => {
  let t = 1_000_000;
  const { base, sent } = await start({ now: () => t });
  const post = (id: string) => fetch(`${base}/webhooks/${id}`, { method: "POST", body: "x" });
  assert.equal((await post("acme")).status, 202);
  assert.equal((await post("acme")).status, 202);
  const limited = await post("acme");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  await settle();
  assert.equal(sent.length, 2);

  t += 999;
  assert.equal((await post("acme")).status, 429);
  t += 1;
  assert.equal((await post("acme")).status, 202);
});

test("one tenant's rate limit and hung destination do not affect another", async () => {
  const sent: { dest: string; w: Webhook }[] = [];
  const send: Send = (dest, w) => (dest.includes("acme") ? new Promise(() => {}) : (sent.push({ dest, w }), Promise.resolve(200)));
  const { base } = await start({ send, concurrencyPerTenant: 1, maxOutstandingPerTenant: 2 });
  const post = (id: string) => fetch(`${base}/webhooks/${id}`, { method: "POST", body: "x" });
  assert.equal((await post("acme")).status, 202);
  assert.equal((await post("acme")).status, 202);
  assert.equal((await post("acme")).status, 503); // acme is saturated (queue full)
  assert.equal((await post("other")).status, 202);
  assert.equal((await post("other")).status, 202);
  await settle();
  assert.equal(sent.length, 2);
});

test("oversized body is 413 and not forwarded", async () => {
  const { base, sent } = await start({ maxBodyBytes: 10 });
  const res = await fetch(`${base}/webhooks/acme`, { method: "POST", body: "x".repeat(11) });
  assert.equal(res.status, 413);
  await settle();
  assert.equal(sent.length, 0);
});

test("logs each request but never the body or secrets", async () => {
  const { base, logs } = await start();
  await fetch(`${base}/webhooks/acme`, {
    method: "POST",
    body: '{"api_key":"sk_live_SECRET"}',
    headers: { "Content-Type": "application/json", Authorization: "Bearer TOPSECRET" },
  });
  await settle();
  const line = logs.find((l) => l.event === "accepted")!;
  assert.equal(line.tenant, "acme");
  assert.equal(line.bytes, 28);
  assert.ok(!JSON.stringify(logs).includes("SECRET"));
});
