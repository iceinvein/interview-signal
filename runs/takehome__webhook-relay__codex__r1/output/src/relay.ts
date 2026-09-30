import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { TenantConfig, Tenants } from './config.js';

export interface Webhook {
  id: string;
  body: Buffer;
  contentType?: string;
}

export type Delivery = (destination: string, event: Webhook) => Promise<number>;
export type DeliveryLog = (record: Record<string, unknown>) => void;

interface TenantState {
  config: TenantConfig;
  acceptedAt: number[];
  queue: Webhook[];
  working: boolean;
}

export type AcceptResult =
  | { kind: 'accepted'; id: string }
  | { kind: 'unknown' }
  | { kind: 'limited'; retryAfterSeconds: number };

export class Relay {
  private readonly states = new Map<string, TenantState>();

  constructor(
    tenants: Tenants,
    private readonly deliver: Delivery,
    private readonly log: DeliveryLog,
    private readonly now: () => number = () => performance.now(),
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  ) {
    for (const [id, config] of Object.entries(tenants)) {
      this.states.set(id, { config, acceptedAt: [], queue: [], working: false });
    }
  }

  accept(tenantId: string, body: Buffer, contentType?: string): AcceptResult {
    const state = this.states.get(tenantId);
    if (!state) return { kind: 'unknown' };

    const now = this.now();
    while (state.acceptedAt.length && state.acceptedAt[0]! <= now - 1000) {
      state.acceptedAt.shift();
    }
    if (state.acceptedAt.length >= state.config.requestsPerSecond) {
      return { kind: 'limited', retryAfterSeconds: Math.max(1, Math.ceil((state.acceptedAt[0]! + 1000 - now) / 1000)) };
    }

    const id = randomUUID();
    state.acceptedAt.push(now);
    state.queue.push({ id, body, contentType });
    if (!state.working) {
      state.working = true;
      queueMicrotask(() => { void this.drain(tenantId, state); });
    }
    return { kind: 'accepted', id };
  }

  private async drain(tenantId: string, state: TenantState): Promise<void> {
    try {
      while (state.queue.length) {
        const event = state.queue[0]!;
        for (let attempt = 1; attempt <= state.config.maxAttempts; attempt++) {
          let status: number | undefined;
          let error: string | undefined;
          try {
            status = await this.deliver(state.config.destination, event);
          } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
          }
          const delivered = status !== undefined && status >= 200 && status < 300;
          this.log({ type: 'delivery', tenantId, webhookId: event.id, attempt, status, error, delivered });
          if (delivered) break;
          if (attempt < state.config.maxAttempts) {
            await this.sleep(state.config.initialBackoffMs * 2 ** (attempt - 1));
          }
        }
        state.queue.shift();
      }
    } finally {
      state.working = false;
      if (state.queue.length) {
        state.working = true;
        queueMicrotask(() => { void this.drain(tenantId, state); });
      }
    }
  }
}

export const fetchDelivery: Delivery = async (destination, event) => {
  const headers: Record<string, string> = { 'X-Webhook-Id': event.id };
  if (event.contentType !== undefined) headers['Content-Type'] = event.contentType;
  const response = await fetch(destination, {
    method: 'POST',
    headers,
    body: new Uint8Array(event.body),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  return response.status;
};
