import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTenants } from "../src/config.ts";

const good = { destination: "https://a.example/x", maxAttempts: 3, initialBackoffMs: 10, requestsPerSecond: 5 };

test("parses valid config", () => {
  const t = parseTenants({ tenants: { acme: good } });
  assert.equal(t.get("acme")?.maxAttempts, 3);
});

test("does not treat prototype keys as tenants", () => {
  const t = parseTenants({ tenants: { acme: good } });
  assert.equal(t.has("constructor"), false);
  assert.equal(t.has("__proto__"), false);
});

for (const [name, bad] of Object.entries({
  "missing destination": { ...good, destination: undefined },
  "non-http destination": { ...good, destination: "file:///etc/passwd" },
  "zero maxAttempts": { ...good, maxAttempts: 0 },
  "fractional backoff": { ...good, initialBackoffMs: 1.5 },
  "zero rate": { ...good, requestsPerSecond: 0 },
})) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseTenants({ tenants: { acme: bad } }), /Invalid tenant config/);
  });
}
