import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: URL;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = Map<string, TenantConfig>;

export class ConfigError extends Error {}

export function loadTenantsFile(path: string): Tenants {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ConfigError(`cannot read tenants file ${path}: ${(err as Error).message}`);
  }
  return parseTenants(raw);
}

/** Validates the whole file up front so a bad config fails at startup, not on the first webhook. */
export function parseTenants(raw: unknown): Tenants {
  if (!isObject(raw) || !isObject(raw.tenants)) {
    throw new ConfigError('tenants file must be an object with a "tenants" object');
  }
  // A Map rather than the parsed object, so ids like "__proto__" or "constructor"
  // can never resolve to something that isn't a configured tenant.
  const tenants: Tenants = new Map();
  for (const [id, value] of Object.entries(raw.tenants)) {
    tenants.set(id, parseTenant(id, value));
  }
  return tenants;
}

function parseTenant(id: string, value: unknown): TenantConfig {
  const fail = (msg: string): never => {
    throw new ConfigError(`tenant "${id}": ${msg}`);
  };
  if (!isObject(value)) fail("must be an object");
  const t = value as Record<string, unknown>;

  let destination: URL;
  try {
    destination = new URL(String(t.destination));
  } catch {
    return fail("destination must be an absolute URL");
  }
  if (destination.protocol !== "http:" && destination.protocol !== "https:") {
    fail("destination must be http or https");
  }

  const { maxAttempts, initialBackoffMs, requestsPerSecond } = t;
  if (!Number.isInteger(maxAttempts) || (maxAttempts as number) < 1) {
    fail("maxAttempts must be an integer >= 1");
  }
  if (!Number.isInteger(initialBackoffMs) || (initialBackoffMs as number) < 0) {
    fail("initialBackoffMs must be an integer >= 0");
  }
  if (!Number.isInteger(requestsPerSecond) || (requestsPerSecond as number) < 1) {
    fail("requestsPerSecond must be an integer >= 1");
  }

  return {
    destination,
    maxAttempts: maxAttempts as number,
    initialBackoffMs: initialBackoffMs as number,
    requestsPerSecond: requestsPerSecond as number,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
