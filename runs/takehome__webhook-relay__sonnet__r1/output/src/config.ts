import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

/** Keyed by tenant id. A Map, so ids like "__proto__" or "constructor" are just ids. */
export type TenantMap = Map<string, TenantConfig>;

export function loadTenants(path: string): TenantMap {
  return parseTenants(JSON.parse(readFileSync(path, "utf8")));
}

export function parseTenants(raw: unknown): TenantMap {
  const tenants = isRecord(raw) ? raw.tenants : undefined;
  if (!isRecord(tenants)) throw new Error(`config: "tenants" must be an object`);

  const result: TenantMap = new Map();
  for (const [id, t] of Object.entries(tenants)) {
    const where = `config: tenant "${id}"`;
    if (!isRecord(t)) throw new Error(`${where} must be an object`);

    const { destination, maxAttempts, initialBackoffMs, requestsPerSecond } = t;
    if (typeof destination !== "string") throw new Error(`${where}: destination must be a string`);
    let url: URL;
    try {
      url = new URL(destination);
    } catch {
      throw new Error(`${where}: destination is not a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${where}: destination must be http(s)`);
    }
    if (!isInt(maxAttempts, 1)) throw new Error(`${where}: maxAttempts must be an integer >= 1`);
    if (!isInt(initialBackoffMs, 0)) throw new Error(`${where}: initialBackoffMs must be an integer >= 0`);
    if (!isInt(requestsPerSecond, 1)) throw new Error(`${where}: requestsPerSecond must be an integer >= 1`);

    result.set(id, { destination, maxAttempts, initialBackoffMs, requestsPerSecond });
  }
  return result;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isInt(v: unknown, min: number): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min;
}
