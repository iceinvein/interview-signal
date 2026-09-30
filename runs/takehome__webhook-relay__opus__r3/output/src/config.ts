import { readFileSync } from "node:fs";

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

/**
 * Tenants are keyed in a Map rather than a plain object so that a path like
 * `/webhooks/__proto__` or `/webhooks/toString` can never resolve to anything.
 */
export type TenantMap = ReadonlyMap<string, TenantConfig>;

export function loadTenantsFile(path: string): TenantMap {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  return parseTenants(parsed);
}

export function parseTenants(input: unknown): TenantMap {
  if (!isObject(input) || !isObject(input.tenants)) {
    throw new Error('tenant config must be an object with a "tenants" object');
  }
  const tenants = new Map<string, TenantConfig>();
  for (const [id, value] of Object.entries(input.tenants)) {
    tenants.set(id, parseTenant(id, value));
  }
  return tenants;
}

function parseTenant(id: string, value: unknown): TenantConfig {
  const fail = (msg: string): never => {
    throw new Error(`tenant "${id}": ${msg}`);
  };
  if (!isObject(value)) fail("must be an object");
  const v = value as Record<string, unknown>;

  if (typeof v.destination !== "string") fail("destination must be a string");
  let url: URL | undefined;
  try {
    url = new URL(v.destination as string);
  } catch {
    fail("destination must be an absolute URL");
  }
  if (url!.protocol !== "https:" && url!.protocol !== "http:") {
    fail("destination must be an http(s) URL");
  }

  return {
    destination: v.destination as string,
    maxAttempts: integer(v.maxAttempts, 1, "maxAttempts", fail),
    initialBackoffMs: integer(v.initialBackoffMs, 0, "initialBackoffMs", fail),
    requestsPerSecond: integer(v.requestsPerSecond, 1, "requestsPerSecond", fail),
  };
}

function integer(value: unknown, min: number, name: string, fail: (msg: string) => never): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    fail(`${name} must be an integer >= ${min}`);
  }
  return value as number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
