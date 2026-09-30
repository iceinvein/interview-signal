import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, parseTenants } from "../src/config.ts";

const valid = { destination: "https://a.example/x", maxAttempts: 3, initialBackoffMs: 100, requestsPerSecond: 5 };

test("parses a valid file", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  assert.equal(tenants.get("acme")?.destination.href, "https://a.example/x");
  assert.equal(tenants.get("acme")?.maxAttempts, 3);
});

test("does not resolve inherited object properties as tenants", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  assert.equal(tenants.get("constructor"), undefined);
  assert.equal(tenants.get("__proto__"), undefined);
});

for (const [name, override] of [
  ["relative destination", { destination: "/x" }],
  ["non-http destination", { destination: "file:///etc/passwd" }],
  ["zero maxAttempts", { maxAttempts: 0 }],
  ["fractional maxAttempts", { maxAttempts: 1.5 }],
  ["negative backoff", { initialBackoffMs: -1 }],
  ["zero rate", { requestsPerSecond: 0 }],
  ["missing field", { requestsPerSecond: undefined }],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseTenants({ tenants: { acme: { ...valid, ...override } } }), ConfigError);
  });
}

test("rejects a file without a tenants object", () => {
  assert.throws(() => parseTenants({}), ConfigError);
  assert.throws(() => parseTenants([]), ConfigError);
});
