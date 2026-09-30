import { readFileSync } from 'node:fs';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = ReadonlyMap<string, TenantConfig>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, minimum: number, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${name} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

export function parseTenants(value: unknown): Tenants {
  if (!object(value) || !object(value.tenants)) {
    throw new Error('configuration must contain a tenants object');
  }

  const tenants = new Map<string, TenantConfig>();
  for (const [id, raw] of Object.entries(value.tenants)) {
    if (!id || !object(raw)) throw new Error(`invalid tenant ${id}`);
    if (typeof raw.destination !== 'string') {
      throw new Error(`${id}.destination must be a URL`);
    }
    let destination: URL;
    try {
      destination = new URL(raw.destination);
    } catch {
      throw new Error(`${id}.destination must be a URL`);
    }
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
      throw new Error(`${id}.destination must be an HTTP(S) URL without credentials`);
    }
    const maxAttempts = integer(raw.maxAttempts, 1, `${id}.maxAttempts`);
    const initialBackoffMs = integer(raw.initialBackoffMs, 0, `${id}.initialBackoffMs`);
    const requestsPerSecond = integer(raw.requestsPerSecond, 1, `${id}.requestsPerSecond`);
    if (maxAttempts > 1 && !Number.isSafeInteger(initialBackoffMs * 2 ** (maxAttempts - 2))) {
      throw new Error(`${id} retry delay exceeds the safe integer range`);
    }
    tenants.set(id, { destination: destination.href, maxAttempts, initialBackoffMs, requestsPerSecond });
  }
  return tenants;
}

export function loadTenants(path: string): Tenants {
  return parseTenants(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}
