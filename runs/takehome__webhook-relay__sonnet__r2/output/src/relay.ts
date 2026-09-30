import type { Clock, Delivery, Logger, Send, Tenant } from "./types.ts";

/**
 * Delivers each webhook independently: every event runs its own retry loop
 * with its own timers, so a slow or dead destination only ever holds up its
 * own events, never another tenant's (or even the same tenant's other events).
 * Ordering is therefore not guaranteed.
 */
export class Relay {
  private inFlight = new Set<Promise<void>>();

  private readonly send: Send;
  private readonly clock: Clock;
  private readonly log: Logger;

  constructor(send: Send, clock: Clock, log: Logger) {
    this.send = send;
    this.clock = clock;
    this.log = log;
  }

  get pending(): number {
    return this.inFlight.size;
  }

  enqueue(tenantId: string, tenant: Tenant, delivery: Delivery): void {
    const p = this.run(tenantId, tenant, delivery).finally(() => this.inFlight.delete(p));
    this.inFlight.add(p);
  }

  /** Resolves when every accepted webhook has been delivered or given up on. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  private async run(tenantId: string, tenant: Tenant, delivery: Delivery): Promise<void> {
    const base = { tenant: tenantId, webhookId: delivery.id };
    for (let attempt = 1; attempt <= tenant.maxAttempts; attempt++) {
      let failure: string;
      try {
        const status = await this.send(delivery);
        if (status >= 200 && status < 300) {
          this.log({ msg: "delivered", ...base, attempt, status });
          return;
        }
        failure = `status ${status}`;
      } catch (err) {
        failure = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (attempt === tenant.maxAttempts) {
        this.log({ msg: "delivery abandoned", ...base, attempt, failure });
        return;
      }
      // Retry n (1-based) waits initialBackoffMs * 2^(n-1); here n === attempt.
      const delayMs = tenant.initialBackoffMs * 2 ** (attempt - 1);
      this.log({ msg: "attempt failed, will retry", ...base, attempt, failure, retryInMs: delayMs });
      await new Promise<void>((resolve) => this.clock.setTimeout(resolve, delayMs));
    }
  }
}

/** Real network sender. */
export const httpSend =
  (timeoutMs = 10_000): Send =>
  async ({ url, id, body, contentType }) => {
    const headers: Record<string, string> = { "X-Webhook-Id": id };
    if (contentType !== undefined) headers["Content-Type"] = contentType;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body as Uint8Array<ArrayBuffer>,
      // A followed 301/302 would turn the POST into a GET and silently drop
      // the payload; treat redirects as failed attempts instead.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return res.status;
  };
