import { randomUUID } from "node:crypto";
import type { Clock } from "./clock.ts";
import type { TenantMap } from "./config.ts";
import { TenantDispatcher, type Sender } from "./delivery.ts";
import type { Logger } from "./logger.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";

export type AcceptResult =
  | { kind: "accepted"; webhookId: string }
  | { kind: "unknown_tenant" }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "backlog_full" };

export interface RelayOptions {
  clock: Clock;
  sender: Sender;
  logger: Logger;
  concurrencyPerTenant: number;
  maxPendingPerTenant: number;
  idGenerator?: () => string;
}

interface TenantState {
  limiter: SlidingWindowLimiter;
  dispatcher: TenantDispatcher;
}

/** Transport-agnostic core: decides whether to accept a webhook and hands it off for delivery. */
export class Relay {
  readonly #tenants = new Map<string, TenantState>();
  readonly #newId: () => string;

  constructor(tenants: TenantMap, opts: RelayOptions) {
    this.#newId = opts.idGenerator ?? randomUUID;
    for (const [id, config] of tenants) {
      this.#tenants.set(id, {
        limiter: new SlidingWindowLimiter(config.requestsPerSecond, opts.clock),
        dispatcher: new TenantDispatcher(config, {
          clock: opts.clock,
          sender: opts.sender,
          logger: opts.logger,
          concurrency: opts.concurrencyPerTenant,
          maxPending: opts.maxPendingPerTenant,
        }),
      });
    }
  }

  hasTenant(tenantId: string): boolean {
    return this.#tenants.has(tenantId);
  }

  accept(tenantId: string, body: Buffer, contentType: string | undefined): AcceptResult {
    const tenant = this.#tenants.get(tenantId);
    if (!tenant) return { kind: "unknown_tenant" };

    // Check the backlog before the limiter so a rejected webhook doesn't use up a rate-limit slot.
    if (!tenant.dispatcher.hasCapacity()) return { kind: "backlog_full" };
    const limit = tenant.limiter.tryAcquire();
    if (!limit.allowed) return { kind: "rate_limited", retryAfterMs: limit.retryAfterMs };

    const webhookId = this.#newId();
    tenant.dispatcher.enqueue({ id: webhookId, tenantId, body, contentType });
    return { kind: "accepted", webhookId };
  }
}
