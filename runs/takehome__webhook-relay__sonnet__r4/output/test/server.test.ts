import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { parseTenants } from "../src/config.ts";
import { httpSender } from "../src/sender.ts";
import { createRelay } from "../src/server.ts";

interface Received {
  id: string | undefined;
  contentType: string | undefined;
  body: Buffer;
  method: string | undefined;
}

const received: Received[] = [];
let destStatuses: number[] = [];
const logs: string[] = [];
let clock = 1_000_000;

let dest: http.Server;
let relay: ReturnType<typeof createRelay>;
let relayUrl: string;

before(async () => {
  dest = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({
        id: req.headers["x-webhook-id"] as string | undefined,
        contentType: req.headers["content-type"],
        body: Buffer.concat(chunks),
        method: req.method,
      });
      res.writeHead(destStatuses.shift() ?? 200).end();
    });
  });
  await new Promise<void>((r) => dest.listen(0, r));
  const destUrl = `http://127.0.0.1:${(dest.address() as AddressInfo).port}/hook`;

  const tenant = (rps: number) => ({
    destination: destUrl,
    maxAttempts: 3,
    initialBackoffMs: 10,
    requestsPerSecond: rps,
  });
  relay = createRelay({
    tenants: parseTenants({
      tenants: { acme: tenant(1000), limited: tenant(2), other: tenant(1000) },
    }),
    send: httpSender(2000),
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
    now: () => clock,
    maxBodyBytes: 1024,
  });
  await new Promise<void>((r) => relay.server.listen(0, r));
  relayUrl = `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}`;
});

after(async () => {
  await relay.close();
  dest.close();
});

const post = (path: string, body: string | Buffer, headers: Record<string, string> = {}) =>
  fetch(relayUrl + path, {
    method: "POST",
    body: typeof body === "string" ? body : new Uint8Array(body),
    headers,
  });
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "condition not met in time");
};

test("202 then forwards exact bytes, content type and X-Webhook-Id", async () => {
  received.length = 0;
  const body = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0a]); // not valid UTF-8
  const res = await post("/webhooks/acme", body, { "Content-Type": "application/x-custom" });
  assert.equal(res.status, 202);
  await until(() => received.length === 1);
  const r = received[0]!;
  assert.equal(r.method, "POST");
  assert.deepEqual(r.body, body);
  assert.equal(r.contentType, "application/x-custom");
  assert.match(r.id ?? "", /^[0-9a-f-]{36}$/);
});

test("retries reuse the same X-Webhook-Id", async () => {
  received.length = 0;
  destStatuses = [500, 503, 200];
  await post("/webhooks/acme", "x");
  await until(() => received.length === 3);
  assert.equal(new Set(received.map((r) => r.id)).size, 1);
});

test("different events get different ids", async () => {
  received.length = 0;
  await post("/webhooks/acme", "1");
  await post("/webhooks/acme", "2");
  await until(() => received.length === 2);
  assert.notEqual(received[0]!.id, received[1]!.id);
});

test("unknown tenants get 404, including prototype-ish names", async () => {
  for (const id of ["nobody", "constructor", "__proto__", "toString"]) {
    assert.equal((await post(`/webhooks/${id}`, "x")).status, 404, id);
  }
});

test("wrong method is 405", async () => {
  const res = await fetch(`${relayUrl}/webhooks/acme`);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("rate limit: 429 + Retry-After, not forwarded, other tenants unaffected", async () => {
  received.length = 0;
  assert.equal((await post("/webhooks/limited", "1")).status, 202);
  assert.equal((await post("/webhooks/limited", "2")).status, 202);
  const limited = await post("/webhooks/limited", "3");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  assert.equal((await post("/webhooks/other", "ok")).status, 202);
  await until(() => received.length === 3);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(received.length, 3, "the rejected webhook must not be forwarded");

  clock += 1000; // window slides
  assert.equal((await post("/webhooks/limited", "4")).status, 202);
});

test("oversized bodies get 413", async () => {
  assert.equal((await post("/webhooks/acme", Buffer.alloc(2048))).status, 413);
});

test("logs describe the request but never contain the body", async () => {
  logs.length = 0;
  const secret = "sk_live_SUPERSECRET_TOKEN";
  await post("/webhooks/acme", JSON.stringify({ api_key: secret }), {
    "Content-Type": "application/json",
    Authorization: "Bearer " + secret,
  });
  await until(() => logs.some((l) => l.includes('"delivered"')));
  const all = logs.join("\n");
  assert.ok(!all.includes(secret));
  assert.match(all, /"event":"request".*"tenantId":"acme".*"status":202/);
});
