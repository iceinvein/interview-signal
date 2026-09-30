import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { TenantConfig } from './config.js';

export interface Webhook {
  id: string;
  body: Buffer;
  contentType?: string;
}

export interface RelayDependencies {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  deliver: (tenant: TenantConfig, webhook: Webhook) => Promise<number>;
  report: (event: DeliveryEvent) => void;
}

export interface DeliveryEvent {
  tenantId: string;
  webhookId: string;
  attempt: number;
  outcome: 'delivered' | 'retrying' | 'exhausted';
  status?: number;
  nextDelayMs?: number;
}

interface TenantState {
  acceptedAt: number[];
  queue: Webhook[];
  active: boolean;
}

export type Acceptance =
  | { kind: 'accepted'; id: string }
  | { kind: 'unknown' }
  | { kind: 'limited'; retryAfter: number };

const defaultDependencies: RelayDependencies = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  deliver: async (tenant, webhook) => {
    const headers: Record<string, string> = { 'X-Webhook-Id': webhook.id };
    if (webhook.contentType !== undefined) headers['Content-Type'] = webhook.contentType;
    const response = await fetch(tenant.destination, {
      method: 'POST',
      headers,
      body: new Uint8Array(webhook.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    // A response code is enough; do not retain a potentially large response body.
    await response.body?.cancel().catch(() => {});
    return response.status;
  },
  report: (event) => console.log(JSON.stringify({ type: 'delivery', ...event })),
};

export class Relay {
  private readonly states = new Map<string, TenantState>();
  private readonly dependencies: RelayDependencies;

  constructor(private readonly tenants: Map<string, TenantConfig>, dependencies: Partial<RelayDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
    for (const id of tenants.keys()) {
      this.states.set(id, { acceptedAt: [], queue: [], active: false });
    }
  }

  accept(tenantId: string, body: Buffer, contentType?: string): Acceptance {
    const tenant = this.tenants.get(tenantId);
    const state = this.states.get(tenantId);
    if (!tenant || !state) return { kind: 'unknown' };

    const now = this.dependencies.now();
    while (state.acceptedAt.length && now - state.acceptedAt[0]! >= 1000) {
      state.acceptedAt.shift();
    }
    if (state.acceptedAt.length >= tenant.requestsPerSecond) {
      const waitMs = Math.max(1, state.acceptedAt[0]! + 1000 - now);
      return { kind: 'limited', retryAfter: Math.ceil(waitMs / 1000) };
    }

    const id = randomUUID();
    state.acceptedAt.push(now);
    state.queue.push({ id, body, contentType });
    if (!state.active) {
      state.active = true;
      queueMicrotask(() => void this.drain(tenantId, tenant, state));
    }
    return { kind: 'accepted', id };
  }

  private async drain(tenantId: string, tenant: TenantConfig, state: TenantState): Promise<void> {
    try {
      while (state.queue.length) {
        const webhook = state.queue.shift()!;
        for (let attempt = 1; attempt <= tenant.maxAttempts; attempt++) {
          let status: number | undefined;
          try {
            status = await this.dependencies.deliver(tenant, webhook);
          } catch {
            // Connection failures and timeouts count as failed attempts.
          }
          if (status !== undefined && status >= 200 && status < 300) {
            this.dependencies.report({ tenantId, webhookId: webhook.id, attempt, outcome: 'delivered', status });
            break;
          }
          if (attempt === tenant.maxAttempts) {
            this.dependencies.report({ tenantId, webhookId: webhook.id, attempt, outcome: 'exhausted', status });
            break;
          }
          const nextDelayMs = tenant.initialBackoffMs * 2 ** (attempt - 1);
          this.dependencies.report({ tenantId, webhookId: webhook.id, attempt, outcome: 'retrying', status, nextDelayMs });
          await this.dependencies.sleep(nextDelayMs);
        }
      }
    } finally {
      state.active = false;
      if (state.queue.length) {
        state.active = true;
        queueMicrotask(() => void this.drain(tenantId, tenant, state));
      }
    }
  }
}
