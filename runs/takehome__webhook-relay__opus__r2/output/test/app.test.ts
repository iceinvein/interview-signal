import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createApp, type AppOptions } from "../src/app.ts";
import { parseTenants } from "../src/config.ts";
import { fetchSender, type OutboundRequest, type Sender } from "../src/delivery.ts";
import { jsonLogger } from "../src/logger.ts";

const tenants = parseTenants({
  tenants: {
    acme: { destination: "https://acme.example/hook", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 2 },
    globex: { destination: "https://globex.example/hook", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 2 },
  },
});

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startRelay(overrides: Partial<AppOptions> = {}) {
  const clock = { now: 0 };
  const sent: OutboundRequest[] = [];
  const logLines: string[] = [];
  const app = createApp({
    tenants,
    send: async (request) => {
      sent.push(request);
      return 200;
    },
    sleep: async () => {},
    now: () => clock.now,
    logger: jsonLogger((line) => logLines.push(line)),
    limits: { maxConcurrent: 4, maxPending: 100 },
    maxBodyBytes: 1024,
    ...overrides,
  });
  const base = await listen(app.server);
  const post = (path: string, body: string | Uint8Array<ArrayBuffer> = "{}", contentType = "application/json") =>
    fetch(base + path, { method: "POST", body, headers: { "content-type": contentType } });
  return { app, base, clock, sent, logLines, post };
}

test("accepts a webhook with 202 and forwards it", async () => {
  const { app, sent, post } = await startRelay();
  const res = await post("/webhooks/acme", '{"hello":"world"}');
  assert.equal(res.status, 202);
  const { id } = (await res.json()) as { id: string };
  await app.whenIdle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url.href, "https://acme.example/hook");
  assert.equal(sent[0]!.headers["x-webhook-id"], id);
  assert.equal(sent[0]!.body.toString(), '{"hello":"world"}');
});

test("replies 202 without waiting for delivery", async () => {
  const { post } = await startRelay({ send: () => new Promise(() => {}) });
  const res = await post("/webhooks/acme");
  assert.equal(res.status, 202);
});

test("gives unknown tenants a 404 and forwards nothing", async () => {
  const { app, sent, post } = await startRelay();
  for (const tenant of ["nobody", "__proto__", "constructor", "%E0%A4%A"]) {
    const res = await post(`/webhooks/${tenant}`);
    assert.equal(res.status, 404, tenant);
  }
  await app.whenIdle();
  assert.equal(sent.length, 0);
});

test("rejects other methods and paths", async () => {
  const { base } = await startRelay();
  assert.equal((await fetch(`${base}/webhooks/acme`)).status, 405);
  assert.equal((await fetch(`${base}/webhooks/acme/extra`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${base}/other`, { method: "POST" })).status, 404);
});

test("rate limits per tenant with 429 and Retry-After, without forwarding", async () => {
  const { app, clock, sent, post } = await startRelay();
  assert.equal((await post("/webhooks/acme")).status, 202);
  clock.now = 200;
  assert.equal((await post("/webhooks/acme")).status, 202);

  clock.now = 300;
  const limited = await post("/webhooks/acme");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1"); // 700ms, rounded up to whole seconds

  // Another tenant is unaffected by acme's limit.
  assert.equal((await post("/webhooks/globex")).status, 202);

  clock.now = 1000;
  assert.equal((await post("/webhooks/acme")).status, 202);

  await app.whenIdle();
  assert.deepEqual(sent.map((r) => r.url.hostname), [
    "acme.example",
    "acme.example",
    "globex.example",
    "acme.example",
  ]);
});

test("a hanging destination for one tenant does not delay another", async () => {
  const delivered: string[] = [];
  const send: Sender = async (request) => {
    if (request.url.hostname === "acme.example") return new Promise(() => {});
    delivered.push(request.url.hostname);
    return 200;
  };
  const { clock, post } = await startRelay({
    send,
    limits: { maxConcurrent: 1, maxPending: 2 },
  });

  // Fill acme's concurrency and backlog completely.
  assert.equal((await post("/webhooks/acme")).status, 202);
  assert.equal((await post("/webhooks/acme")).status, 202);
  clock.now = 1000;
  assert.equal((await post("/webhooks/acme")).status, 503);

  assert.equal((await post("/webhooks/globex")).status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, ["globex.example"]);
});

test("rejects bodies over the size limit with 413", async () => {
  const { app, sent, post } = await startRelay();
  const res = await post("/webhooks/acme", new Uint8Array(1025));
  assert.equal(res.status, 413);
  await app.whenIdle();
  assert.equal(sent.length, 0);
});

test("logs each request without the body", async () => {
  const { app, logLines, post } = await startRelay();
  const secret = "sk_live_DO_NOT_LOG_ME";
  await post("/webhooks/acme", JSON.stringify({ apiKey: secret }));
  await post("/webhooks/nobody", JSON.stringify({ apiKey: secret }));
  await app.whenIdle();

  const entries = logLines.map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.ok(logLines.every((l) => !l.includes(secret)), "secret must not appear in logs");

  const accepted = entries.find((e) => e.event === "webhook.accepted")!;
  assert.equal(accepted.tenantId, "acme");
  assert.equal(accepted.bodyBytes, 34);
  assert.match(String(accepted.bodySha256), /^[0-9a-f]{64}$/);
  assert.ok(entries.some((e) => e.event === "webhook.rejected" && e.tenantId === "nobody" && e.status === 404));
  assert.ok(entries.some((e) => e.event === "delivery.succeeded" && e.webhookId === accepted.webhookId));
});

test("end to end over real HTTP: same bytes, content type and id on every retry", async () => {
  const received: Array<{ body: Buffer; contentType?: string; id?: string }> = [];
  const destination = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    received.push({
      body: Buffer.concat(chunks),
      contentType: req.headers["content-type"],
      id: req.headers["x-webhook-id"] as string | undefined,
    });
    res.writeHead(received.length < 3 ? 503 : 200).end();
  });
  const destinationUrl = await listen(destination);

  const sleeps: number[] = [];
  const { app, post } = await startRelay({
    tenants: parseTenants({
      tenants: {
        acme: { destination: `${destinationUrl}/in`, maxAttempts: 5, initialBackoffMs: 50, requestsPerSecond: 5 },
      },
    }),
    send: fetchSender(2000),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x0a]);
  const res = await post("/webhooks/acme", payload, "application/x-custom; charset=binary");
  const { id } = (await res.json()) as { id: string };
  await app.whenIdle();

  assert.equal(received.length, 3);
  assert.deepEqual(sleeps, [50, 100]);
  for (const r of received) {
    assert.deepEqual(r.body, Buffer.from(payload));
    assert.equal(r.contentType, "application/x-custom; charset=binary");
    assert.equal(r.id, id);
  }
});

test("fetchSender treats an unreachable destination as a thrown error", async () => {
  const closed = createServer();
  const url = await listen(closed);
  closed.close();
  await once(closed, "close");
  await assert.rejects(fetchSender(1000)({ url: new URL(url), body: Buffer.from(""), headers: {} }));
});
