import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTenants } from "../src/config.ts";

const valid = {
  destination: "https://hooks.example/relay",
  maxAttempts: 5,
  initialBackoffMs: 1000,
  requestsPerSecond: 20,
};

test("parses a valid file", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  assert.equal(tenants.get("acme")?.maxAttempts, 5);
});

test("inherited property names are not tenants", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  assert.equal(tenants.get("constructor"), undefined);
  assert.equal(tenants.get("__proto__"), undefined);
});

for (const [name, override] of [
  ["zero maxAttempts", { maxAttempts: 0 }],
  ["fractional backoff", { initialBackoffMs: 1.5 }],
  ["string rate", { requestsPerSecond: "20" }],
  ["non-http destination", { destination: "file:///etc/passwd" }],
  ["garbage destination", { destination: "nope" }],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseTenants({ tenants: { acme: { ...valid, ...override } } }));
  });
}

test("rejects a file without tenants", () => {
  assert.throws(() => parseTenants({}));
});
