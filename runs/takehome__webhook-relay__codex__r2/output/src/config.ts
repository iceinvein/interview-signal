import { readFile } from 'node:fs/promises';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = Record<string, TenantConfig>;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseTenants(value: unknown): Tenants {
  if (!object(value) || !object(value.tenants)) {
    throw new Error('Configuration must contain a tenants object');
  }

  const tenants: Tenants = Object.create(null) as Tenants;
  for (const [id, entry] of Object.entries(value.tenants)) {
    if (!id || !object(entry)) throw new Error(`Invalid tenant: ${id}`);
    const { destination, maxAttempts, initialBackoffMs, requestsPerSecond } = entry;
    let url: URL;
    try {
      if (typeof destination !== 'string') throw new Error();
      url = new URL(destination);
    } catch {
      throw new Error(`Tenant ${id}: destination must be an absolute URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Tenant ${id}: destination must use HTTP or HTTPS`);
    }
    if (!Number.isSafeInteger(maxAttempts) || (maxAttempts as number) < 1 ||
        !Number.isSafeInteger(initialBackoffMs) || (initialBackoffMs as number) < 0 ||
        !Number.isSafeInteger(requestsPerSecond) || (requestsPerSecond as number) < 1) {
      throw new Error(`Tenant ${id}: maxAttempts and requestsPerSecond must be positive integers; initialBackoffMs must be a nonnegative integer`);
    }
    const longestDelay = (initialBackoffMs as number) * 2 ** ((maxAttempts as number) - 2);
    if ((maxAttempts as number) > 1 && !Number.isSafeInteger(longestDelay)) {
      throw new Error(`Tenant ${id}: retry delay exceeds the safe integer range`);
    }
    tenants[id] = {
      destination: url.toString(),
      maxAttempts: maxAttempts as number,
      initialBackoffMs: initialBackoffMs as number,
      requestsPerSecond: requestsPerSecond as number,
    };
  }
  return tenants;
}

export async function loadTenants(path: string): Promise<Tenants> {
  return parseTenants(JSON.parse(await readFile(path, 'utf8')) as unknown);
}
