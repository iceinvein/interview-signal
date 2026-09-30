import { readFile } from "node:fs/promises";

export interface TenantConfig {
  destination: URL;
  /** Total attempts, including the first. */
  maxAttempts: number;
  /** Wait before the first retry; doubles for each retry after that. */
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = ReadonlyMap<string, TenantConfig>;

export async function loadTenantsFile(path: string): Promise<Tenants> {
  const text = await readFile(path, "utf8");
  return parseTenants(JSON.parse(text));
}

/** Validates the whole file up front so a bad config fails at startup, not on the first webhook. */
export function parseTenants(raw: unknown): Tenants {
  if (!isObject(raw) || !isObject(raw.tenants)) {
    throw new Error('tenants file must be an object with a "tenants" object');
  }
  const tenants = new Map<string, TenantConfig>();
  for (const [id, value] of Object.entries(raw.tenants)) {
    tenants.set(id, parseTenant(id, value));
  }
  return tenants;
}

function parseTenant(id: string, raw: unknown): TenantConfig {
  const fail = (msg: string): never => {
    throw new Error(`tenant "${id}": ${msg}`);
  };
  if (!isObject(raw)) return fail("must be an object");

  let destination: URL;
  try {
    destination = new URL(String(raw.destination));
  } catch {
    return fail("destination must be a valid URL");
  }
  if (destination.protocol !== "https:" && destination.protocol !== "http:") {
    fail("destination must be an http(s) URL");
  }

  const int = (key: string, min: number): number => {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
      fail(`${key} must be an integer >= ${min}`);
    }
    return v as number;
  };

  return {
    destination,
    maxAttempts: int("maxAttempts", 1),
    initialBackoffMs: int("initialBackoffMs", 0),
    requestsPerSecond: int("requestsPerSecond", 1),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
