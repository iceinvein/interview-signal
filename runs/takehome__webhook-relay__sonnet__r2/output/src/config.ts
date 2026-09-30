import { readFileSync } from "node:fs";
import type { Tenant } from "./types.ts";

export function parseTenants(raw: unknown): Map<string, Tenant> {
  const tenants = (raw as { tenants?: unknown } | null)?.tenants;
  if (typeof tenants !== "object" || tenants === null || Array.isArray(tenants)) {
    throw new Error('config must be an object with a "tenants" object');
  }
  const result = new Map<string, Tenant>();
  for (const [id, value] of Object.entries(tenants)) {
    const t = value as Record<string, unknown>;
    const fail = (msg: string): never => {
      throw new Error(`tenant "${id}": ${msg}`);
    };
    if (typeof t?.destination !== "string") return fail("destination must be a string");
    let url: URL;
    try {
      url = new URL(t.destination);
    } catch {
      return fail("destination is not a valid URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail("destination must be http or https");
    }
    if (!Number.isInteger(t.maxAttempts) || (t.maxAttempts as number) < 1) {
      return fail("maxAttempts must be an integer >= 1");
    }
    if (!Number.isFinite(t.initialBackoffMs) || (t.initialBackoffMs as number) < 0) {
      return fail("initialBackoffMs must be a number >= 0");
    }
    if (!Number.isInteger(t.requestsPerSecond) || (t.requestsPerSecond as number) < 1) {
      return fail("requestsPerSecond must be an integer >= 1");
    }
    result.set(id, {
      destination: t.destination,
      maxAttempts: t.maxAttempts as number,
      initialBackoffMs: t.initialBackoffMs as number,
      requestsPerSecond: t.requestsPerSecond as number,
    });
  }
  return result;
}

export function loadTenants(path: string): Map<string, Tenant> {
  return parseTenants(JSON.parse(readFileSync(path, "utf8")));
}
