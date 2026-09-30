import { readFile } from 'node:fs/promises';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = Record<string, TenantConfig>;

function positiveInteger(value: unknown, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  }
  return value as number;
}

export function parseTenants(value: unknown): Tenants {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !('tenants' in value) || typeof value.tenants !== 'object' ||
      value.tenants === null || Array.isArray(value.tenants)) {
    throw new Error('configuration must contain a tenants object');
  }

  const tenants: Tenants = Object.create(null) as Tenants;
  for (const [id, raw] of Object.entries(value.tenants)) {
    if (!id || typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`invalid tenant ${id}`);
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.destination !== 'string') {
      throw new Error(`${id}.destination must be an HTTP(S) URL`);
    }
    let url: URL;
    try {
      url = new URL(entry.destination);
    } catch {
      throw new Error(`${id}.destination must be an HTTP(S) URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error(`${id}.destination must be an HTTP(S) URL without credentials`);
    }
    tenants[id] = {
      destination: entry.destination,
      maxAttempts: positiveInteger(entry.maxAttempts, `${id}.maxAttempts`),
      initialBackoffMs: positiveInteger(entry.initialBackoffMs, `${id}.initialBackoffMs`, true),
      requestsPerSecond: positiveInteger(entry.requestsPerSecond, `${id}.requestsPerSecond`),
    };
  }
  return tenants;
}

export async function loadTenants(path: string): Promise<Tenants> {
  return parseTenants(JSON.parse(await readFile(path, 'utf8')));
}
