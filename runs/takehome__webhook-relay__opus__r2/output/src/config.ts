import { readFile } from "node:fs/promises";

export interface TenantConfig {
  destination: URL;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = ReadonlyMap<string, TenantConfig>;

export async function loadTenants(path: string): Promise<Tenants> {
  const text = await readFile(path, "utf8");
  return parseTenants(JSON.parse(text));
}

/** Validates the whole file up front so a bad config fails at startup, not on first delivery. */
export function parseTenants(raw: unknown): Tenants {
  if (!isRecord(raw) || !isRecord(raw.tenants)) {
    throw new Error('tenants file must be an object with a "tenants" object');
  }
  const tenants = new Map<string, TenantConfig>();
  for (const [id, value] of Object.entries(raw.tenants)) {
    tenants.set(id, parseTenant(id, value));
  }
  return tenants;
}

function parseTenant(id: string, value: unknown): TenantConfig {
  const fail = (msg: string): never => {
    throw new Error(`tenant "${id}": ${msg}`);
  };
  if (!isRecord(value)) fail("must be an object");
  const v = value as Record<string, unknown>;

  if (typeof v.destination !== "string" || !URL.canParse(v.destination)) {
    fail("destination must be an absolute URL");
  }
  const destination = new URL(v.destination as string);
  if (destination.protocol !== "https:" && destination.protocol !== "http:") {
    fail("destination must be http or https");
  }

  return {
    destination,
    maxAttempts: integer(v.maxAttempts, 1) ?? fail("maxAttempts must be an integer >= 1"),
    initialBackoffMs: integer(v.initialBackoffMs, 0) ?? fail("initialBackoffMs must be an integer >= 0"),
    requestsPerSecond:
      integer(v.requestsPerSecond, 1) ?? fail("requestsPerSecond must be an integer >= 1"),
  };
}

function integer(value: unknown, min: number): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= min ? (value as number) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
