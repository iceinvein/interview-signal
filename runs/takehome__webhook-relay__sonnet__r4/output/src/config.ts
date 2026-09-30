import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

function positiveInt(tenantId: string, field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`tenant "${tenantId}": ${field} must be a positive integer`);
  }
  return value;
}

/** Validates the parsed config file. Throws on the first problem so a bad file fails startup. */
export function parseTenants(raw: unknown): Map<string, TenantConfig> {
  const tenants = (raw as { tenants?: unknown } | null)?.tenants;
  if (typeof tenants !== "object" || tenants === null || Array.isArray(tenants)) {
    throw new Error('config must be an object with a "tenants" object');
  }
  // A Map (not a plain object) so ids like "constructor" or "__proto__" can't match inherited keys.
  const result = new Map<string, TenantConfig>();
  for (const [id, value] of Object.entries(tenants)) {
    const t = value as Record<string, unknown> | null;
    if (typeof t !== "object" || t === null) throw new Error(`tenant "${id}": must be an object`);
    let url: URL;
    try {
      url = new URL(String(t.destination));
    } catch {
      throw new Error(`tenant "${id}": destination is not a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`tenant "${id}": destination must be http or https`);
    }
    result.set(id, {
      destination: url.toString(),
      maxAttempts: positiveInt(id, "maxAttempts", t.maxAttempts),
      initialBackoffMs: positiveInt(id, "initialBackoffMs", t.initialBackoffMs),
      requestsPerSecond: positiveInt(id, "requestsPerSecond", t.requestsPerSecond),
    });
  }
  return result;
}

export function loadTenants(path: string): Map<string, TenantConfig> {
  return parseTenants(JSON.parse(readFileSync(path, "utf8")));
}
