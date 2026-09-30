import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

/** Parses and validates tenant config. Throws with a precise message so a bad file fails startup. */
export function parseTenants(json: unknown): Map<string, TenantConfig> {
  const tenants = (json as { tenants?: unknown } | null)?.tenants;
  if (typeof tenants !== "object" || tenants === null || Array.isArray(tenants)) {
    throw new Error('config: "tenants" must be an object');
  }
  // A Map (not a plain object) so ids like "__proto__" or "constructor" can never match by accident.
  const result = new Map<string, TenantConfig>();
  for (const [id, raw] of Object.entries(tenants)) {
    const t = raw as Record<string, unknown> | null;
    const where = `config: tenant "${id}"`;
    if (typeof t !== "object" || t === null) throw new Error(`${where} must be an object`);
    if (typeof t.destination !== "string") throw new Error(`${where}: destination must be a string`);
    let url: URL;
    try {
      url = new URL(t.destination);
    } catch {
      throw new Error(`${where}: destination is not a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${where}: destination must be http or https`);
    }
    result.set(id, {
      destination: url.toString(),
      maxAttempts: positiveInt(t.maxAttempts, `${where}: maxAttempts`),
      initialBackoffMs: positiveInt(t.initialBackoffMs, `${where}: initialBackoffMs`),
      requestsPerSecond: positiveInt(t.requestsPerSecond, `${where}: requestsPerSecond`),
    });
  }
  return result;
}

export function loadTenants(path: string): Map<string, TenantConfig> {
  return parseTenants(JSON.parse(readFileSync(path, "utf8")));
}

function positiveInt(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
