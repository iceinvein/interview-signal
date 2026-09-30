import { readFile } from 'node:fs/promises';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export class ConfigError extends Error {}

/** Parses and validates the tenants file. Throws ConfigError on anything we can't run with. */
export function parseTenants(raw: string): Map<string, TenantConfig> {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`tenants file is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObject(doc) || !isObject(doc.tenants)) {
    throw new ConfigError('tenants file must be an object with a "tenants" object');
  }

  const tenants = new Map<string, TenantConfig>();
  for (const [id, value] of Object.entries(doc.tenants)) {
    const where = `tenant "${id}"`;
    if (!isObject(value)) throw new ConfigError(`${where} must be an object`);

    const { destination, maxAttempts, initialBackoffMs, requestsPerSecond } = value;
    if (typeof destination !== 'string' || !isHttpUrl(destination)) {
      throw new ConfigError(`${where}: destination must be an http(s) URL`);
    }
    if (!isInt(maxAttempts) || maxAttempts < 1) {
      throw new ConfigError(`${where}: maxAttempts must be an integer >= 1`);
    }
    if (!isInt(initialBackoffMs) || initialBackoffMs < 0) {
      throw new ConfigError(`${where}: initialBackoffMs must be an integer >= 0`);
    }
    if (!isInt(requestsPerSecond) || requestsPerSecond < 1) {
      throw new ConfigError(`${where}: requestsPerSecond must be an integer >= 1`);
    }
    tenants.set(id, { destination, maxAttempts, initialBackoffMs, requestsPerSecond });
  }
  return tenants;
}

export async function loadTenants(path: string): Promise<Map<string, TenantConfig>> {
  return parseTenants(await readFile(path, 'utf8'));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return Number.isSafeInteger(v);
}

function isHttpUrl(s: string): boolean {
  try {
    const { protocol } = new URL(s);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
