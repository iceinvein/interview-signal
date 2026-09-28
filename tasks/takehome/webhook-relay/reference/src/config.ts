import { readFileSync } from "node:fs";

export type TenantConfig = {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
};

export function loadTenants(path: string): Map<string, TenantConfig> {
  return parseTenants(readFileSync(path, "utf8"));
}

export function parseTenants(json: string): Map<string, TenantConfig> {
  const root = JSON.parse(json) as unknown;
  if (!isObject(root) || !isObject(root.tenants)) {
    throw new Error('tenant config must be an object with a "tenants" object');
  }
  const tenants = new Map<string, TenantConfig>();
  for (const [id, raw] of Object.entries(root.tenants)) {
    tenants.set(id, parseTenant(id, raw));
  }
  return tenants;
}

function parseTenant(id: string, raw: unknown): TenantConfig {
  if (!isObject(raw)) throw new Error(`tenant ${id}: settings must be an object`);
  const { destination } = raw;
  if (typeof destination !== "string" || !/^https?:\/\//.test(destination) || !URL.canParse(destination)) {
    throw new Error(`tenant ${id}: destination must be an http or https URL`);
  }
  return {
    destination,
    maxAttempts: positiveInteger(id, raw, "maxAttempts"),
    initialBackoffMs: positiveInteger(id, raw, "initialBackoffMs"),
    requestsPerSecond: positiveInteger(id, raw, "requestsPerSecond"),
  };
}

function positiveInteger(id: string, raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`tenant ${id}: ${key} must be a positive integer`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
