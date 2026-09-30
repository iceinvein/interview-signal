import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import type { TenantConfig, Tenants } from "../src/config.ts";
import type { AttemptResult, OutboundRequest } from "../src/delivery.ts";
import { createRelayServer } from "../src/server.ts";
import { captureLogger, FakeClock, ok, scriptedSender } from "./helpers.ts";

const tenant = (host: string, over: Partial<TenantConfig> = {}): TenantConfig => ({
  destination: new URL(`https://${host}.example/hook`),
  maxAttempts: 3,
  initialBackoffMs: 1000,
  requestsPerSecond: 2,
  ...over,
});

const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(respond: (req: OutboundRequest, n: number) => AttemptResult | "hang", tenants?: Tenants) {
  const clock = new FakeClock();
  const log = captureLogger();
  const sender = scriptedSender(clock, respond);
  let n = 0;
  const server = createRelayServer({
    tenants: tenants ?? new Map([["acme", tenant("acme")], ["globex", tenant("globex")]]),
    send: sender.send,
    clock,
    log,
    maxBodyBytes: 1024,
    queue: { concurrency: 2, maxPending: 5 },
    newId: () => `id-${++n}`,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: string | Buffer = "{}", contentType = "application/json") =>
    fetch(base + path, { method: "POST", body: body as string | Uint8Array<ArrayBuffer>, headers: { "content-type": contentType } });
  return { clock, log, post, base, ...sender };
}

test("accepts with 202 and the event id, then forwards body, content type and id", async () => {
  const { post, clock, calls } = await start(() => ok);
  const body = Buffer.from([0, 255, 1, 254]);
  const res = await post("/webhooks/acme", body, "application/octet-stream");

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { id: "id-1" });
  await clock.advance(0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url.href, "https://acme.example/hook");
  assert.equal(calls[0]!.webhookId, "id-1");
  assert.equal(calls[0]!.contentType, "application/octet-stream");
  assert.deepEqual(calls[0]!.body, body);
});

test("replies 202 without waiting for delivery", async () => {
  const { post, calls } = await start(() => "hang");
  const res = await post("/webhooks/acme");
  assert.equal(res.status, 202);
  assert.equal(calls.length, 1);
});

test("unknown tenants get 404 and nothing is forwarded", async () => {
  const { post, calls } = await start(() => ok);
  for (const path of ["/webhooks/nobody", "/webhooks/constructor", "/webhooks/__proto__", "/webhooks/%E0%A4%A"]) {
    assert.equal((await post(path)).status, 404, path);
  }
  assert.equal((await post("/elsewhere")).status, 404);
  assert.equal(calls.length, 0);
});

test("non-POST methods on the webhook route get 405", async () => {
  const { base } = await start(() => ok);
  const res = await fetch(base + "/webhooks/acme");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("over-limit webhooks get 429 with Retry-After and are not forwarded", async () => {
  const { post, clock, calls } = await start(() => ok); // acme: 2 per second
  assert.equal((await post("/webhooks/acme")).status, 202); // t=0
  await clock.advance(300);
  assert.equal((await post("/webhooks/acme")).status, 202); // t=300
  await clock.advance(200);

  const limited = await post("/webhooks/acme"); // t=500, slot frees at t=1000
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  await clock.advance(0);
  assert.equal(calls.length, 2);

  await clock.advance(500); // t=1000
  assert.equal((await post("/webhooks/acme")).status, 202);
});

test("Retry-After rounds up to whole seconds", async () => {
  const tenants = new Map([["slow", tenant("slow", { requestsPerSecond: 1 })]]);
  const { post, clock } = await start(() => ok, tenants);
  await post("/webhooks/slow");
  await clock.advance(1);
  assert.equal((await post("/webhooks/slow")).headers.get("retry-after"), "1"); // 999ms -> 1s
});

test("one tenant hitting its rate limit does not affect another", async () => {
  const { post } = await start(() => ok);
  await post("/webhooks/acme");
  await post("/webhooks/acme");
  assert.equal((await post("/webhooks/acme")).status, 429);
  assert.equal((await post("/webhooks/globex")).status, 202);
  assert.equal((await post("/webhooks/globex")).status, 202);
});

test("one tenant's hung destination and full backlog do not delay or reject another's", async () => {
  const tenants = new Map([
    ["acme", tenant("acme", { requestsPerSecond: 100 })],
    ["globex", tenant("globex")],
  ]);
  const { post, clock, calls } = await start((req) => (req.url.host === "acme.example" ? "hang" : ok), tenants);

  // Fill acme's backlog (maxPending 5): 2 in flight forever, 3 queued, 6th rejected.
  for (let i = 0; i < 5; i++) assert.equal((await post("/webhooks/acme")).status, 202);
  const full = await post("/webhooks/acme");
  assert.equal(full.status, 503);
  assert.equal(full.headers.get("retry-after"), "1");

  assert.equal((await post("/webhooks/globex")).status, 202);
  await clock.advance(0);
  assert.equal(calls.filter((c) => c.url.host === "globex.example").length, 1);
});

test("bodies over the size limit get 413 and are not forwarded", async () => {
  const { post, calls } = await start(() => ok);
  const res = await post("/webhooks/acme", Buffer.alloc(1025));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("logs every request with metadata and a body hash, but never the body", async () => {
  const { post, log } = await start(() => ok);
  const secret = JSON.stringify({ api_key: "sk_live_supersecret" });
  await post("/webhooks/acme?token=querysecret", secret);
  await post("/webhooks/nobody", secret);

  const requests = log.lines.filter((l) => l.msg === "request");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.fields.status, 202);
  assert.equal(requests[0]!.fields.tenantId, "acme");
  assert.equal(requests[0]!.fields.webhookId, "id-1");
  assert.equal(requests[0]!.fields.bodyBytes, Buffer.byteLength(secret));
  assert.match(String(requests[0]!.fields.bodySha256), /^[0-9a-f]{64}$/);
  assert.equal(requests[1]!.fields.status, 404);

  const text = JSON.stringify(log.lines);
  assert.ok(!text.includes("supersecret"));
  assert.ok(!text.includes("querysecret"));
});
