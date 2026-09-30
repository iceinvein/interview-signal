import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTenants } from "../src/config.ts";

const valid = { destination: "https://a.example/x", maxAttempts: 5, initialBackoffMs: 1000, requestsPerSecond: 20 };

test("parses a valid tenants file", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  assert.equal(tenants.get("acme")?.destination.href, "https://a.example/x");
  assert.equal(tenants.get("acme")?.maxAttempts, 5);
});

test("rejects invalid tenant settings with the tenant named", () => {
  const cases: Array<Record<string, unknown>> = [
    { destination: "not a url" },
    { destination: "ftp://a.example/" },
    { maxAttempts: 0 },
    { maxAttempts: 1.5 },
    { initialBackoffMs: -1 },
    { requestsPerSecond: 0 },
    { requestsPerSecond: "20" },
  ];
  for (const override of cases) {
    assert.throws(() => parseTenants({ tenants: { acme: { ...valid, ...override } } }), /tenant "acme"/);
  }
  assert.throws(() => parseTenants({}), /"tenants"/);
});
