import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { fetchSender } from "../src/delivery.ts";
import { jsonLogger } from "../src/logger.ts";
import { Relay } from "../src/relay.ts";
import { createRelayServer } from "../src/server.ts";
import { FakeClock } from "./fakeClock.ts";

interface Received {
  headers: IncomingHttpHeaders;
  body: Buffer;
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A destination that records requests and answers with `status`, or never answers if `status` is undefined. */
function destination(status: number | undefined) {
  const received: Received[] = [];
  const waiters: (() => void)[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      waiters.splice(0).forEach((w) => w());
      if (status === undefined) return;
      res.statusCode = status;
      if (status >= 300 && status < 400) res.setHeader("location", "http://127.0.0.1:1/elsewhere");
      res.end();
    });
  });
  const nextRequest = () => new Promise<void>((r) => waiters.push(r));
  return { server, received, nextRequest };
}

describe("HTTP relay (end to end)", () => {
  const ok = destination(200);
  const hung = destination(undefined);
  const logLines: string[] = [];
  const clock = new FakeClock();
  let relayServer: Server;
  let base: string;

  before(async () => {
    const okUrl = await listen(ok.server);
    const hungUrl = await listen(hung.server);
    const cfg = { maxAttempts: 1, initialBackoffMs: 0, requestsPerSecond: 2 };
    const tenants = new Map([
      ["acme", { ...cfg, destination: `${okUrl}/hook?token=s3cret` }],
      ["stuck", { ...cfg, destination: `${hungUrl}/hook` }],
    ]);
    const logger = jsonLogger((l) => logLines.push(l));
    const relay = new Relay(tenants, {
      clock, // rate-limit windows only move when the test advances time
      sender: fetchSender(5_000),
      logger,
      concurrencyPerTenant: 5,
      maxPendingPerTenant: 100,
    });
    relayServer = createRelayServer({ relay, logger, maxBodyBytes: 1024 });
    base = await listen(relayServer);
  });

  after(() => {
    for (const s of [relayServer, ok.server, hung.server]) s.closeAllConnections();
    for (const s of [relayServer, ok.server, hung.server]) s.close();
  });

  const post = (tenant: string, body: BodyInit, headers: Record<string, string> = {}) =>
    fetch(`${base}/webhooks/${tenant}`, { method: "POST", body, headers });

  it("accepts with 202 and forwards the exact bytes, Content-Type and webhook id", async () => {
    const bytes = Buffer.from([0xde, 0xad, 0x00, 0xbe, 0xef]);
    const delivered = ok.nextRequest();
    const res = await post("acme", bytes, { "content-type": "application/x-custom; charset=binary" });

    assert.equal(res.status, 202);
    const { id } = (await res.json()) as { id: string };
    assert.equal(res.headers.get("x-webhook-id"), id);

    await delivered;
    const got = ok.received.at(-1)!;
    assert.deepEqual(got.body, bytes);
    assert.equal(got.headers["content-type"], "application/x-custom; charset=binary");
    assert.equal(got.headers["x-webhook-id"], id);
    await clock.advance(1000);
  });

  it("replies 202 without waiting for a destination that never answers", async () => {
    const delivered = hung.nextRequest();
    const res = await post("stuck", "{}", { "content-type": "application/json" });
    assert.equal(res.status, 202);
    await delivered; // the relay is still waiting on this one
    await clock.advance(1000);
  });

  it("returns 404 for unknown tenants, including prototype property names", async () => {
    for (const tenant of ["nobody", "__proto__", "constructor"]) {
      assert.equal((await post(tenant, "{}")).status, 404, tenant);
    }
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await fetch(`${base}/webhooks/acme`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  });

  it("returns 413 for bodies over the size limit", async () => {
    assert.equal((await post("acme", Buffer.alloc(2048))).status, 413);
  });

  it("returns 429 with Retry-After over the limit, and doesn't forward it, without affecting other tenants", async () => {
    const before = ok.received.length;
    assert.equal((await post("acme", "1")).status, 202);
    assert.equal((await post("acme", "2")).status, 202);
    const limited = await post("acme", "3");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");

    assert.equal((await post("stuck", "x")).status, 202, "other tenant unaffected");

    await clock.advance(1000);
    assert.equal((await post("acme", "4")).status, 202, "accepted again once the window passes");
    while (ok.received.length < before + 3) await ok.nextRequest();
    assert.deepEqual(ok.received.slice(before).map((r) => r.body.toString()).sort(), ["1", "2", "4"]);
    await clock.advance(1000);
  });

  it("logs requests without the body or destination secrets", async () => {
    const secret = "sk_live_THIS_MUST_NOT_BE_LOGGED";
    const res = await post("acme", JSON.stringify({ apiKey: secret }), { "content-type": "application/json" });
    const { id } = (await res.json()) as { id: string };
    await ok.nextRequest();
    await new Promise((r) => setImmediate(r));

    const all = logLines.join("\n");
    assert.ok(!all.includes(secret), "body must not be logged");
    assert.ok(!all.includes("s3cret"), "destination URL must not be logged");
    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.msg === "request" && l.webhookId === id);
    assert.equal(line.status, 202);
    assert.equal(line.tenantId, "acme");
    assert.match(line.bodySha256, /^[0-9a-f]{64}$/);
    await clock.advance(1000);
  });
});

describe("fetchSender", () => {
  const send = fetchSender(200);

  for (const [status, ok] of [[200, true], [204, true], [302, false], [404, false], [500, false]] as const) {
    it(`treats HTTP ${status} as ${ok ? "delivered" : "failed"}`, async () => {
      const dest = destination(status);
      const url = await listen(dest.server);
      try {
        const outcome = await send(url, {}, Buffer.from("x"));
        assert.equal(outcome.ok, ok);
        assert.equal(outcome.status, status);
        assert.equal(dest.received.length, 1, "redirects are not followed");
      } finally {
        dest.server.close();
      }
    });
  }

  it("treats connection errors as failed", async () => {
    const closed = createServer();
    const url = await listen(closed);
    closed.close();
    await once(closed, "close");
    const outcome = await send(url, {}, Buffer.from("x"));
    assert.deepEqual(outcome, { ok: false, error: "ECONNREFUSED" });
  });

  it("times out a destination that never answers", async () => {
    const dest = destination(undefined);
    const url = await listen(dest.server);
    try {
      assert.deepEqual(await send(url, {}, Buffer.from("x")), { ok: false, error: "timeout" });
    } finally {
      dest.server.closeAllConnections();
      dest.server.close();
    }
  });
});
