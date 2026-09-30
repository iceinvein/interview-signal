import { randomUUID } from "node:crypto";
import type { Clock } from "./clock.ts";
import type { Tenants } from "./config.ts";
import { Deliverer } from "./delivery.ts";
import type { Logger } from "./logger.ts";
import { RateLimiter } from "./rateLimiter.ts";
import type { Sender } from "./sender.ts";

export type AcceptResult =
  | { status: "accepted"; id: string }
  | { status: "unknown_tenant" }
  | { status: "rate_limited"; retryAfterSec: number }
  | { status: "overloaded"; retryAfterSec: number };

interface TenantState {
  limiter: RateLimiter;
  pending: number;
}

export interface RelayOptions {
  /** Max undelivered webhooks held in memory per tenant. */
  maxPendingPerTenant?: number;
}

export class Relay {
  private readonly state = new Map<string, TenantState>();
  private readonly deliverer: Deliverer;
  private readonly maxPending: number;
  private readonly tenants: Tenants;
  private readonly clock: Clock;

  constructor(tenants: Tenants, send: Sender, clock: Clock, log: Logger, opts: RelayOptions = {}) {
    this.tenants = tenants;
    this.clock = clock;
    this.deliverer = new Deliverer(send, clock, log);
    this.maxPending = opts.maxPendingPerTenant ?? 1000;
    for (const [id, t] of tenants) this.state.set(id, { limiter: new RateLimiter(t.requestsPerSecond), pending: 0 });
  }

  hasTenant(id: string): boolean {
    return this.tenants.has(id);
  }

  accept(tenantId: string, body: Buffer, contentType: string | undefined): AcceptResult {
    const tenant = this.tenants.get(tenantId);
    const st = this.state.get(tenantId);
    if (!tenant || !st) return { status: "unknown_tenant" };

    const decision = st.limiter.tryAcquire(this.clock.now());
    if (!decision.ok) return { status: "rate_limited", retryAfterSec: Math.max(1, Math.ceil(decision.retryAfterMs / 1000)) };

    // Checked after the limiter, so it only ever fires for this tenant's own backlog.
    if (st.pending >= this.maxPending) return { status: "overloaded", retryAfterSec: 30 };

    const id = randomUUID();
    st.pending++;
    void this.deliverer.run({ id, tenantId, tenant, body, contentType }).finally(() => st.pending--);
    return { status: "accepted", id };
  }
}
