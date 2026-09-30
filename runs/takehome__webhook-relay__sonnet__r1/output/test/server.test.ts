import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { systemClock } from "../src/clock.ts";
import { parseTenants } from "../src/config.ts";
import { Relay } from "../src/relay.ts";
import { httpSender } from "../src/sender.ts";
import { createRelayServer } from "../src/server.ts";
import { CapturingLogger } from "./helpers.ts";

type Received = { headers: IncomingHttpHeaders; body: Buffer };

const listen = (s: Server) => new Promise<number>((r) => s.listen(0, () => r((s.address() as AddressInfo).port)));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "timed out waiting");
};

describe("HTTP service (real sockets)", () => {
  const received: Received[] = [];
  let destStatus = 200;
  let dest: Server;
  let app: Server;
  let base: string;
  const logger = new CapturingLogger();
  const SECRET = "sk_live_super_secret_token";

  before(async () => {
    dest = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks) });
        res.statusCode = destStatus;
        res.end();
      });
    });
    const destPort = await listen(dest);
    const tenants = parseTenants({
      tenants: {
        acme: { destination: `http://127.0.0.1:${destPort}/relay`, maxAttempts: 3, initialBackoffMs: 10, requestsPerSecond: 3 },
        other: { destination: `http://127.0.0.1:${destPort}/relay`, maxAttempts: 1, initialBackoffMs: 10, requestsPerSecond: 50 },
      },
    });
    const relay = new Relay({ tenants, send: httpSender(2000), clock: systemClock, logger });
    app = createRelayServer({ relay, logger, maxBodyBytes: 1024 });
    base = `http://127.0.0.1:${await listen(app)}`;
  });

  after(() => {
    app.closeAllConnections();
    dest.closeAllConnections();
    app.close();
    dest.close();
  });

  test("202, forwards raw bytes and content type with X-Webhook-Id", async () => {
    received.length = 0;
    const body = Buffer.from([0x00, 0xff, 0xfe, 0x10, 0x80]); // not valid UTF-8
    const res = await fetch(`${base}/webhooks/other`, { method: "POST", body, headers: { "Content-Type": "application/x-custom" } });
    assert.equal(res.status, 202);
    const { id } = (await res.json()) as { id: string };

    await until(() => received.length === 1);
    assert.deepEqual(received[0]!.body, body);
    assert.equal(received[0]!.headers["content-type"], "application/x-custom");
    assert.equal(received[0]!.headers["x-webhook-id"], id);
  });

  test("unknown tenant is 404 and prototype names are not tenants", async () => {
    for (const id of ["nobody", "__proto__", "constructor", "toString"]) {
      const res = await fetch(`${base}/webhooks/${id}`, { method: "POST", body: "x" });
      assert.equal(res.status, 404, id);
    }
  });

  test("non-POST is 405", async () => {
    const res = await fetch(`${base}/webhooks/other`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  });

  test("oversized body is 413 and not forwarded", async () => {
    received.length = 0;
    const res = await fetch(`${base}/webhooks/other`, { method: "POST", body: "x".repeat(5000) });
    assert.equal(res.status, 413);
    assert.equal(received.length, 0);
  });

  test("retries a failing destination with the same id, then gives up", async () => {
    received.length = 0;
    destStatus = 500;
    // "acme" has maxAttempts 3 and a 10ms backoff
    const res = await fetch(`${base}/webhooks/acme`, { method: "POST", body: "retry-me" });
    assert.equal(res.status, 202);
    await until(() => received.length === 3);
    assert.equal(new Set(received.map((r) => r.headers["x-webhook-id"])).size, 1);
    destStatus = 200;
  });

  test("429 with Retry-After over the limit, without affecting another tenant", async () => {
    await new Promise((r) => setTimeout(r, 1100)); // let acme's window from the previous test clear
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/webhooks/acme`, { method: "POST", body: "x" });
      statuses.push(res.status);
      if (res.status === 429) retryAfter = res.headers.get("retry-after");
    }
    assert.deepEqual(statuses, [202, 202, 202, 429, 429]);
    assert.match(retryAfter ?? "", /^[1-9]\d*$/);

    const ok = await fetch(`${base}/webhooks/other`, { method: "POST", body: "x" });
    assert.equal(ok.status, 202);
  });

  test("logs requests but never the payload", async () => {
    await fetch(`${base}/webhooks/other`, { method: "POST", body: JSON.stringify({ apiKey: SECRET }) });
    const log = logger.lines.join("\n");
    assert.match(log, /"msg":"request"/);
    assert.ok(!log.includes(SECRET));
  });
});
