import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { parseTenants } from "../src/config.ts";
import type { Sender } from "../src/dispatcher.ts";
import { createHttpSender } from "../src/http-sender.ts";
import { createRelay, type RelayOptions } from "../src/relay.ts";

const servers: Server[] = [];
after(() => {
  for (const s of servers) s.closeAllConnections(), s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

interface Received {
  body: Buffer;
  headers: IncomingMessage["headers"];
}

/** A destination that records requests and answers with whatever `respond` returns. */
async function destination(respond: (n: number) => number | "hang" = () => 200) {
  const received: Received[] = [];
  const waiters: (() => void)[] = [];
  const url = await listen(
    createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      received.push({ body: Buffer.concat(chunks), headers: req.headers });
      waiters.splice(0).forEach((w) => w());
      const status = respond(received.length);
      if (status !== "hang") res.writeHead(status).end();
    }),
  );
  const waitFor = async (count: number) => {
    while (received.length < count) await new Promise<void>((r) => waiters.push(r));
  };
  return { url, received, waitFor };
}

function tenant(dest: string, overrides: Record<string, unknown> = {}) {
  return { destination: dest, maxAttempts: 3, initialBackoffMs: 10, requestsPerSecond: 100, ...overrides };
}

async function relay(tenants: Record<string, unknown>, options: Partial<RelayOptions> = {}) {
  const logs: { event: string; fields: Record<string, unknown> }[] = [];
  const url = await listen(
    createRelay({
      tenants: parseTenants({ tenants }),
      send: createHttpSender(1000),
      log: (event, fields) => logs.push({ event, fields }),
      ...options,
    }),
  );
  return { url, logs };
}

const post = (url: string, body: string | Uint8Array<ArrayBuffer> = "{}", contentType = "application/json") =>
  fetch(url, { method: "POST", body, headers: { "content-type": contentType } });

test("accepts with 202 and forwards the same bytes, content type and a webhook id", async () => {
  const dest = await destination();
  const { url } = await relay({ acme: tenant(dest.url) });
  const payload = new Uint8Array([0x00, 0xff, 0x10, 0x80]);

  const res = await post(`${url}/webhooks/acme`, payload, "application/octet-stream");
  assert.equal(res.status, 202);
  const { id } = (await res.json()) as { id: string };

  await dest.waitFor(1);
  const [got] = dest.received;
  assert.deepEqual(got!.body, Buffer.from(payload));
  assert.equal(got!.headers["content-type"], "application/octet-stream");
  assert.equal(got!.headers["x-webhook-id"], id);
});

test("replies before delivery completes", async () => {
  const dest = await destination(() => "hang");
  const { url } = await relay({ acme: tenant(dest.url) });
  const res = await post(`${url}/webhooks/acme`);
  assert.equal(res.status, 202);
});

test("retries over real HTTP with the same X-Webhook-Id", async () => {
  const dest = await destination((n) => (n < 3 ? 500 : 200));
  const { url, logs } = await relay({ acme: tenant(dest.url) });
  await post(`${url}/webhooks/acme`);
  await dest.waitFor(3);
  const ids = new Set(dest.received.map((r) => r.headers["x-webhook-id"]));
  assert.equal(ids.size, 1);
  const outcomes = logs.filter((l) => l.event === "delivery_attempt").map((l) => l.fields.outcome);
  assert.deepEqual(outcomes.slice(0, 2), ["retrying", "retrying"]);
});

test("connection errors count as failed attempts", async () => {
  const events: unknown[] = [];
  const { url } = await relay(
    { acme: tenant("http://127.0.0.1:1/unreachable", { maxAttempts: 2 }) },
    { log: (event, f) => event === "delivery_attempt" && events.push(f.outcome) },
  );
  await post(`${url}/webhooks/acme`);
  while (events.length < 2) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(events, ["retrying", "gave_up"]);
});

test("unknown tenant gets 404 and nothing is forwarded", async () => {
  let sent = 0;
  const { url } = await relay({}, { send: async () => (sent++, 200) });
  assert.equal((await post(`${url}/webhooks/nobody`)).status, 404);
  assert.equal((await post(`${url}/elsewhere`)).status, 404);
  assert.equal((await post(`${url}/webhooks/%E0`)).status, 400);
  assert.equal(sent, 0);
});

test("non-POST to a webhook route gets 405", async () => {
  const { url } = await relay({ acme: tenant("http://x.example") });
  assert.equal((await fetch(`${url}/webhooks/acme`)).status, 405);
});

test("rate limit: 429 with Retry-After, not forwarded, and other tenants unaffected", async () => {
  let now = 0;
  const sent: string[] = [];
  const send: Sender = async (_u, w) => (sent.push(w.tenantId), 200);
  const { url } = await relay(
    {
      noisy: tenant("http://noisy.example", { requestsPerSecond: 2 }),
      quiet: tenant("http://quiet.example", { requestsPerSecond: 2 }),
    },
    { send, now: () => now },
  );

  assert.equal((await post(`${url}/webhooks/noisy`)).status, 202);
  now = 400;
  assert.equal((await post(`${url}/webhooks/noisy`)).status, 202);
  now = 500;
  const limited = await post(`${url}/webhooks/noisy`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");

  assert.equal((await post(`${url}/webhooks/quiet`)).status, 202, "quiet tenant has its own budget");

  now = 1000;
  assert.equal((await post(`${url}/webhooks/noisy`)).status, 202, "first slot has expired");
  now = 1001;
  assert.equal((await post(`${url}/webhooks/noisy`)).status, 429);

  assert.deepEqual(sent.sort(), ["noisy", "noisy", "noisy", "quiet"]);
});

test("a hung destination does not delay another tenant's deliveries", async () => {
  const slow = await destination(() => "hang");
  const fast = await destination();
  const { url } = await relay(
    { slow: tenant(slow.url), fast: tenant(fast.url) },
    { maxConcurrencyPerTenant: 2, maxPendingPerTenant: 5 },
  );

  const slowStatuses = [];
  for (let i = 0; i < 7; i++) slowStatuses.push((await post(`${url}/webhooks/slow`)).status);
  assert.deepEqual(slowStatuses, [202, 202, 202, 202, 202, 503, 503], "slow tenant's backlog is bounded");

  assert.equal((await post(`${url}/webhooks/fast`)).status, 202);
  await fast.waitFor(1);
  assert.equal(slow.received.length, 2, "slow tenant is capped at its own concurrency");
});

test("rejects bodies over the size limit with 413", async () => {
  let sent = 0;
  const { url } = await relay(
    { acme: tenant("http://x.example") },
    { maxBodyBytes: 10, send: async () => (sent++, 200) },
  );
  assert.equal((await post(`${url}/webhooks/acme`, "x".repeat(11))).status, 413);
  assert.equal((await post(`${url}/webhooks/acme`, "x".repeat(10))).status, 202);
  assert.equal(sent, 1);
});

test("request logs identify the payload without containing it", async () => {
  const { url, logs } = await relay({ acme: tenant("http://x.example") }, { send: async () => 200 });
  const secret = "sk_live_DO_NOT_LOG";
  await post(`${url}/webhooks/acme`, JSON.stringify({ apiKey: secret }));

  const entry = logs.find((l) => l.event === "request");
  assert.ok(entry);
  assert.equal(entry.fields.status, 202);
  assert.equal(entry.fields.tenantId, "acme");
  assert.match(String(entry.fields.bodySha256), /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(logs).includes(secret));
});
