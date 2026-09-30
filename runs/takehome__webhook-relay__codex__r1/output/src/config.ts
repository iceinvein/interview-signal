import { readFile } from 'node:fs/promises';

export interface TenantConfig {
  destination: string;
  maxAttempts: number;
  initialBackoffMs: number;
  requestsPerSecond: number;
}

export type Tenants = Record<string, TenantConfig>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseConfig(value: unknown): Tenants {
  if (!isRecord(value) || !isRecord(value.tenants)) {
    throw new Error('Configuration must contain a tenants object');
  }

  const tenants: Tenants = Object.create(null) as Tenants;
  for (const [id, raw] of Object.entries(value.tenants)) {
    if (!id || !isRecord(raw)) throw new Error(`Invalid tenant: ${id}`);
    const { destination, maxAttempts, initialBackoffMs, requestsPerSecond } = raw;
    let url: URL;
    try {
      url = new URL(destination as string);
    } catch {
      throw new Error(`Invalid destination for tenant ${id}`);
    }
    if (typeof destination !== 'string' || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid destination for tenant ${id}`);
    }
    if (!Number.isSafeInteger(maxAttempts) || (maxAttempts as number) < 1 ||
        typeof initialBackoffMs !== 'number' || !Number.isFinite(initialBackoffMs) || initialBackoffMs < 0 ||
        !Number.isSafeInteger(requestsPerSecond) || (requestsPerSecond as number) < 1) {
      throw new Error(`Invalid delivery or rate-limit settings for tenant ${id}`);
    }
    tenants[id] = {
      destination,
      maxAttempts: maxAttempts as number,
      initialBackoffMs,
      requestsPerSecond: requestsPerSecond as number,
    };
  }
  return tenants;
}

export async function loadConfig(path: string): Promise<Tenants> {
  return parseConfig(JSON.parse(await readFile(path, 'utf8')));
}
