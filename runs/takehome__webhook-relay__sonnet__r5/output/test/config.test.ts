import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTenants } from "../src/config.ts";

const valid = { destination: "https://a.example/x", maxAttempts: 2, initialBackoffMs: 10, requestsPerSecond: 3 };

test("parses valid tenants", () => {
  const t = parseTenants({ tenants: { acme: valid } });
  assert.equal(t.get("acme")?.maxAttempts, 2);
});

test("prototype-ish tenant ids are not looked up on Object.prototype", () => {
  const t = parseTenants({ tenants: { acme: valid } });
  assert.equal(t.get("constructor"), undefined);
  assert.equal(t.get("__proto__"), undefined);
});

for (const [name, bad] of Object.entries({
  "missing tenants": {},
  "non-http destination": { tenants: { a: { ...valid, destination: "file:///etc/passwd" } } },
  "garbage destination": { tenants: { a: { ...valid, destination: "nope" } } },
  "zero attempts": { tenants: { a: { ...valid, maxAttempts: 0 } } },
  "fractional rps": { tenants: { a: { ...valid, requestsPerSecond: 1.5 } } },
  "string backoff": { tenants: { a: { ...valid, initialBackoffMs: "1000" } } },
})) {
  test(`rejects ${name}`, () => assert.throws(() => parseTenants(bad)));
}
