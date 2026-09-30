import { readFileSync } from 'node:fs';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

export function parseTenants(value: unknown): Map<string, TenantConfig> {
  if (!record(value) || !record(value.tenants)) {
    throw new Error('Configuration must contain a tenants object');
  }

  const tenants = new Map<string, TenantConfig>();
  for (const [id, raw] of Object.entries(value.tenants)) {
    if (!id || !record(raw)) {
      throw new Error(`Invalid tenant ${JSON.stringify(id)}`);
    }
    if (typeof raw.destination !== 'string') {
      throw new Error(`${id}.destination must be an HTTP(S) URL`);
    }
    let destination: URL;
    try {
      destination = new URL(raw.destination);
    } catch {
      throw new Error(`${id}.destination must be an HTTP(S) URL`);
    }
    if (!['http:', 'https:'].includes(destination.protocol)) {
      throw new Error(`${id}.destination must be an HTTP(S) URL`);
    }

    const maxAttempts = integer(raw.maxAttempts, 1, `${id}.maxAttempts`);
    const initialBackoffMs = integer(raw.initialBackoffMs, 0, `${id}.initialBackoffMs`);
    const requestsPerSecond = integer(raw.requestsPerSecond, 1, `${id}.requestsPerSecond`);
    // Node timers cannot represent larger delays accurately.
    if (initialBackoffMs * 2 ** (maxAttempts - 2) > 2_147_483_647) {
      throw new Error(`${id} retry delay exceeds the timer range`);
    }
    tenants.set(id, { destination: destination.href, maxAttempts, initialBackoffMs, requestsPerSecond });
  }
  return tenants;
}

export function loadTenants(path: string): Map<string, TenantConfig> {
  return parseTenants(JSON.parse(readFileSync(path, 'utf8')));
}
