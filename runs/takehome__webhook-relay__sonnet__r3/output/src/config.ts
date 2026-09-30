import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = Map<string, TenantConfig>;

function fail(path: string, msg: string): never {
  throw new Error(`Invalid tenant config at ${path}: ${msg}`);
}

function int(path: string, v: unknown, min: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) fail(path, `must be an integer >= ${min}`);
  return v;
}

export function parseTenants(raw: unknown): Tenants {
  if (typeof raw !== "object" || raw === null || typeof (raw as any).tenants !== "object" || (raw as any).tenants === null) {
    fail("tenants", "expected an object");
  }
  const tenants: Tenants = new Map(); // Map, so ids like "__proto__" are ordinary keys
  for (const [id, t] of Object.entries((raw as any).tenants)) {
    const p = `tenants.${id}`;
    if (typeof t !== "object" || t === null) fail(p, "expected an object");
    const c = t as Record<string, unknown>;
    let url: URL;
    try {
      url = new URL(String(c.destination));
    } catch {
      fail(`${p}.destination`, "must be an absolute URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") fail(`${p}.destination`, "must be http(s)");
    tenants.set(id, {
      destination: url.href,
      maxAttempts: int(`${p}.maxAttempts`, c.maxAttempts, 1),
      initialBackoffMs: int(`${p}.initialBackoffMs`, c.initialBackoffMs, 0),
      requestsPerSecond: int(`${p}.requestsPerSecond`, c.requestsPerSecond, 1),
    });
  }
  return tenants;
}

export function loadTenants(file: string): Tenants {
  return parseTenants(JSON.parse(readFileSync(file, "utf8")));
}
