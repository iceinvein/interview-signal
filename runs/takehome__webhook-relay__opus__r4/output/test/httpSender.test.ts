import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { httpSender } from "../src/httpSender.ts";

async function destination(handler: (req: IncomingMessage, body: Buffer, res: ServerResponse) => void) {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    handler(req, Buffer.concat(chunks), res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`);
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  return { url, close };
}

const send = httpSender({ timeoutMs: 200 });

test("POSTs the body, content type and X-Webhook-Id; 2xx is success", async (t) => {
  let seen: { method?: string; headers?: IncomingMessage["headers"]; body?: Buffer } = {};
  const dest = await destination((req, body, res) => {
    seen = { method: req.method, headers: req.headers, body };
    res.writeHead(204).end();
  });
  t.after(dest.close);

  const body = Buffer.from("a=1&b=2");
  const result = await send({ url: dest.url, webhookId: "wh_1", body, contentType: "application/x-www-form-urlencoded" });

  assert.deepEqual(result, { ok: true, status: 204 });
  assert.equal(seen.method, "POST");
  assert.equal(seen.headers?.["x-webhook-id"], "wh_1");
  assert.equal(seen.headers?.["content-type"], "application/x-www-form-urlencoded");
  assert.deepEqual(seen.body, body);
});

for (const status of [301, 400, 500, 503]) {
  test(`${status} is a failed attempt`, async (t) => {
    const dest = await destination((_, __, res) => res.writeHead(status, { location: "http://elsewhere.example/" }).end());
    t.after(dest.close);
    assert.deepEqual(await send({ url: dest.url, webhookId: "x", body: Buffer.alloc(0), contentType: undefined }), {
      ok: false,
      status,
    });
  });
}

test("connection refused is a failed attempt", async () => {
  const dest = await destination(() => {});
  dest.close();
  const result = await send({ url: dest.url, webhookId: "x", body: Buffer.alloc(0), contentType: undefined });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "ECONNREFUSED");
});

test("a destination that never answers times out as a failed attempt", async (t) => {
  const dest = await destination(() => {}); // never responds
  t.after(dest.close);
  const result = await send({ url: dest.url, webhookId: "x", body: Buffer.alloc(0), contentType: undefined });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "TimeoutError");
});
