import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listen } from "../support/helpers.ts";

test("npm start entrypoint: real process retries a failing destination with a stable X-Webhook-Id", async () => {
  const received: { id: string | undefined; body: string; type: string | undefined }[] = [];
  const dest = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ id: req.headers["x-webhook-id"] as string, body: Buffer.concat(chunks).toString(), type: req.headers["content-type"] });
      res.writeHead(received.length < 3 ? 503 : 200).end();
    });
  });
  const destUrl = await listen(dest);

  const file = join(mkdtempSync(join(tmpdir(), "relay-")), "tenants.json");
  writeFileSync(file, JSON.stringify({ tenants: { acme: { destination: destUrl, maxAttempts: 4, initialBackoffMs: 30, requestsPerSecond: 10 } } }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn("node", ["src/main.ts"], { env: { ...process.env, PORT: String(port), TENANTS_FILE: file }, stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (c) => reject(new Error(`exited ${c}`)));
      child.stdout.on("data", (d) => String(d).includes("listening") && resolve());
    });
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/acme`, { method: "POST", body: "hello", headers: { "Content-Type": "text/x-test" } });
    assert.equal(res.status, 202);
    for (let i = 0; i < 100 && received.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(received.length, 3);
    assert.equal(new Set(received.map((r) => r.id)).size, 1);
    assert.ok(received[0]!.id);
    assert.ok(received.every((r) => r.body === "hello" && r.type === "text/x-test"));
  } finally {
    child.kill();
    dest.close();
    dest.closeAllConnections();
  }
});
