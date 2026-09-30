import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTenants } from "../src/config.ts";

const ok = { destination: "https://x.example/h", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 5 };

test("parses a valid config", () => {
  assert.deepEqual(parseTenants({ tenants: { a: ok } }).get("a"), ok);
});

test("rejects invalid configs with a message naming the tenant", () => {
  const bad = [
    { ...ok, destination: "not a url" },
    { ...ok, destination: "file:///etc/passwd" },
    { ...ok, maxAttempts: 0 },
    { ...ok, initialBackoffMs: -1 },
    { ...ok, requestsPerSecond: 0 },
    { ...ok, requestsPerSecond: 1.5 },
  ];
  for (const t of bad) assert.throws(() => parseTenants({ tenants: { a: t } }), /tenant "a"/);
  assert.throws(() => parseTenants({}), /tenants/);
});
