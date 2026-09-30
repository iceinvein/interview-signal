import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTenants } from "../src/config.ts";

const ok = { destination: "https://a.example/x", maxAttempts: 3, initialBackoffMs: 10, requestsPerSecond: 5 };

test("parses a valid config", () => {
  assert.equal(parseTenants({ tenants: { a: ok } }).get("a")!.maxAttempts, 3);
});

test("rejects invalid tenants with a message naming the tenant", () => {
  const bad = [
    { ...ok, destination: "not a url" },
    { ...ok, destination: "ftp://x/" },
    { ...ok, maxAttempts: 0 },
    { ...ok, maxAttempts: 1.5 },
    { ...ok, initialBackoffMs: -1 },
    { ...ok, requestsPerSecond: 0 },
  ];
  for (const t of bad) assert.throws(() => parseTenants({ tenants: { a: t } }), /tenant "a"/);
  assert.throws(() => parseTenants({}), /tenants/);
});
