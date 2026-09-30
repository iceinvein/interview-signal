import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTenants } from "../src/config.ts";

const valid = {
  destination: "https://hooks.acme.example/relay",
  maxAttempts: 5,
  initialBackoffMs: 1000,
  requestsPerSecond: 20,
};

test("parses a valid tenants file", () => {
  const tenants = parseTenants({ tenants: { acme: valid } });
  const acme = tenants.get("acme");
  assert.equal(acme?.destination.href, valid.destination);
  assert.equal(acme?.maxAttempts, 5);
});

test("rejects invalid tenants with the tenant and field named", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ destination: "not a url" }, /acme.*destination/],
    [{ destination: "ftp://x.example" }, /acme.*http/],
    [{ maxAttempts: 0 }, /acme.*maxAttempts/],
    [{ initialBackoffMs: -1 }, /acme.*initialBackoffMs/],
    [{ requestsPerSecond: 1.5 }, /acme.*requestsPerSecond/],
    [{ requestsPerSecond: undefined }, /acme.*requestsPerSecond/],
  ];
  for (const [override, message] of cases) {
    assert.throws(() => parseTenants({ tenants: { acme: { ...valid, ...override } } }), message);
  }
  assert.throws(() => parseTenants({}), /tenants/);
});
