import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTenants } from "../src/config.ts";

const valid = { destination: "https://example.test/hook", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 5 };

describe("parseTenants", () => {
  it("parses a valid config", () => {
    const tenants = parseTenants({ tenants: { acme: valid } });
    assert.deepEqual(tenants.get("acme"), valid);
  });

  it("does not resolve inherited object properties as tenants", () => {
    const tenants = parseTenants({ tenants: { acme: valid } });
    assert.equal(tenants.get("__proto__"), undefined);
    assert.equal(tenants.get("toString"), undefined);
  });

  for (const [field, value] of [
    ["destination", "not a url"],
    ["destination", "ftp://example.test"],
    ["maxAttempts", 0],
    ["maxAttempts", 1.5],
    ["initialBackoffMs", -1],
    ["requestsPerSecond", 0],
    ["requestsPerSecond", "20"],
  ] as const) {
    it(`rejects ${field}=${JSON.stringify(value)} naming the tenant`, () => {
      assert.throws(() => parseTenants({ tenants: { acme: { ...valid, [field]: value } } }), /tenant "acme"/);
    });
  }

  it("rejects a file without a tenants object", () => {
    assert.throws(() => parseTenants({}), /"tenants"/);
  });
});
