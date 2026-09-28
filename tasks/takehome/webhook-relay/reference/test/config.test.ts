import { describe, expect, it } from "vitest";
import { parseTenants } from "../src/config.ts";

const acme = {
  destination: "https://hooks.acme.example/relay",
  maxAttempts: 5,
  initialBackoffMs: 1000,
  requestsPerSecond: 20,
};

describe("parseTenants", () => {
  it("reads each tenant's settings by id", () => {
    const tenants = parseTenants(JSON.stringify({ tenants: { acme } }));
    expect(tenants.get("acme")).toEqual(acme);
  });

  it("rejects a tenant with a setting missing, naming the tenant and the setting", () => {
    const { requestsPerSecond: _, ...incomplete } = acme;
    expect(() => parseTenants(JSON.stringify({ tenants: { acme: incomplete } }))).toThrow(
      /acme.*requestsPerSecond/,
    );
  });

  it("rejects a destination that is not an http(s) URL", () => {
    const bad = { ...acme, destination: "ftp://example.com" };
    expect(() => parseTenants(JSON.stringify({ tenants: { acme: bad } }))).toThrow(/acme.*destination/);
  });

  it("rejects zero attempts", () => {
    const bad = { ...acme, maxAttempts: 0 };
    expect(() => parseTenants(JSON.stringify({ tenants: { acme: bad } }))).toThrow(/acme.*maxAttempts/);
  });
});
