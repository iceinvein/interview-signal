import { randomUUID } from "node:crypto";
import type { Clock } from "./clock.ts";
import type { TenantConfig, TenantMap } from "./config.ts";
import type { Logger } from "./logger.ts";
import { SlidingWindowLimiter } from "./rateLimiter.ts";
import type { Sender } from "./sender.ts";

export type AcceptResult =
  | { kind: "accepted"; id: string }
  | { kind: "unknown-tenant" }
  | { kind: "rate-limited"; retryAfterSec: number }
  | { kind: "overloaded"; retryAfterSec: number };

export interface RelayOptions {
  tenants: TenantMap;
  send: Sender;
  clock: Clock;
  logger: Logger;
  /** Max undelivered webhooks held in memory per tenant (bounds memory when a destination is down). */
  maxPendingPerTenant?: number;
}

interface TenantState {
  config: TenantConfig;
  limiter: SlidingWindowLimiter;
  pending: number;
}

export interface Webhook {
  body: Buffer;
  contentType: string | undefined;
}

/**
 * Accepts webhooks and delivers each one in its own async task. All state is per
 * tenant, and no delivery awaits another, so a slow or failing tenant only
 * consumes its own pending budget.
 */
export class Relay {
  private readonly tenants = new Map<string, TenantState>();
  private readonly maxPending: number;
  private readonly opts: RelayOptions;

  constructor(opts: RelayOptions) {
    this.opts = opts;
    this.maxPending = opts.maxPendingPerTenant ?? 1000;
    for (const [id, config] of opts.tenants) {
      this.tenants.set(id, {
        config,
        limiter: new SlidingWindowLimiter(config.requestsPerSecond, opts.clock),
        pending: 0,
      });
    }
  }

  hasTenant(id: string): boolean {
    return this.tenants.has(id);
  }

  pendingCount(): number {
    let n = 0;
    for (const t of this.tenants.values()) n += t.pending;
    return n;
  }

  accept(tenantId: string, webhook: Webhook): AcceptResult {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { kind: "unknown-tenant" };

    // Capacity is checked before the limiter so a rejected webhook doesn't spend rate-limit budget.
    if (tenant.pending >= this.maxPending) return { kind: "overloaded", retryAfterSec: 1 };

    const verdict = tenant.limiter.tryAcquire();
    if (!verdict.ok) {
      return { kind: "rate-limited", retryAfterSec: Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)) };
    }

    const id = randomUUID();
    tenant.pending++;
    this.deliver(tenantId, tenant.config, id, webhook)
      .catch((err) => this.opts.logger.error("delivery crashed", { tenantId, webhookId: id, err: String(err) }))
      .finally(() => tenant.pending--);
    return { kind: "accepted", id };
  }

  private async deliver(tenantId: string, cfg: TenantConfig, webhookId: string, webhook: Webhook): Promise<void> {
    const { logger, clock, send } = this.opts;

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
      let outcome: { status: number } | { error: string };
      try {
        outcome = await send({
          url: cfg.destination,
          body: webhook.body,
          contentType: webhook.contentType,
          webhookId,
        });
      } catch (err) {
        outcome = { error: describeError(err) };
      }

      if ("status" in outcome && outcome.status >= 200 && outcome.status < 300) {
        logger.info("delivered", { tenantId, webhookId, attempt, status: outcome.status });
        return;
      }

      logger.info("delivery attempt failed", { tenantId, webhookId, attempt, maxAttempts: cfg.maxAttempts, ...outcome });
      if (attempt < cfg.maxAttempts) await clock.sleep(cfg.initialBackoffMs * 2 ** (attempt - 1));
    }
    logger.error("delivery abandoned", { tenantId, webhookId, attempts: cfg.maxAttempts });
  }
}

/** Error text without the URL: destination URLs may carry credentials in the query string. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err.cause as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? `${err.name}: ${code}` : err.name;
  }
  return "unknown error";
}
