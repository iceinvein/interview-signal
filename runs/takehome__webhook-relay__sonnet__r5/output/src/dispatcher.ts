import type { TenantConfig } from "./config.ts";

export interface Webhook {
  id: string;
  body: Buffer;
  contentType: string | undefined;
}

/** Resolves with the HTTP status; rejects on connection error or timeout. */
export type Send = (destination: string, webhook: Webhook) => Promise<number>;
export type Log = (event: Record<string, unknown>) => void;

export interface DispatcherOptions {
  /** Max deliveries in flight at once for this tenant. */
  concurrency: number;
  /** Max webhooks held (queued, in flight, or waiting to retry) for this tenant. */
  maxOutstanding: number;
}

// setTimeout treats delays above 2^31-1 ms as 1 ms, which would turn a long backoff into a hot loop.
const MAX_TIMER_MS = 2 ** 31 - 1;

interface Job {
  webhook: Webhook;
  attempts: number;
}

/**
 * Delivery for ONE tenant. Each tenant gets its own instance, so a slow or dead
 * destination can only exhaust that tenant's own concurrency and queue.
 * A webhook waiting out a backoff holds no concurrency slot.
 */
export class TenantDispatcher {
  private readonly ready: Job[] = [];
  private inFlight = 0;
  private outstanding = 0;

  private readonly tenantId: string;
  private readonly config: TenantConfig;
  private readonly send: Send;
  private readonly log: Log;
  private readonly options: DispatcherOptions;

  constructor(tenantId: string, config: TenantConfig, send: Send, log: Log, options: DispatcherOptions) {
    this.tenantId = tenantId;
    this.config = config;
    this.send = send;
    this.log = log;
    this.options = options;
  }

  get isFull(): boolean {
    return this.outstanding >= this.options.maxOutstanding;
  }

  /** Returns false (and takes nothing) if the tenant is at capacity. */
  offer(webhook: Webhook): boolean {
    if (this.isFull) return false;
    this.outstanding++;
    this.ready.push({ webhook, attempts: 0 });
    this.pump();
    return true;
  }

  private pump(): void {
    while (this.inFlight < this.options.concurrency && this.ready.length > 0) {
      this.inFlight++;
      void this.attempt(this.ready.shift()!);
    }
  }

  private async attempt(job: Job): Promise<void> {
    job.attempts++;
    let outcome: string;
    let ok = false;
    try {
      const status = await this.send(this.config.destination, job.webhook);
      ok = status >= 200 && status < 300;
      outcome = `status ${status}`;
    } catch (err) {
      outcome = `error ${err instanceof Error ? err.message : String(err)}`;
    }
    this.inFlight--;

    const base = { tenant: this.tenantId, webhookId: job.webhook.id, attempt: job.attempts, outcome };
    if (ok) {
      this.outstanding--;
      this.log({ event: "delivered", ...base });
    } else if (job.attempts >= this.config.maxAttempts) {
      this.outstanding--;
      this.log({ event: "gave_up", ...base });
    } else {
      // wait initialBackoffMs before the 1st retry, doubling for each retry after that
      const delay = Math.min(this.config.initialBackoffMs * 2 ** (job.attempts - 1), MAX_TIMER_MS);
      this.log({ event: "retry_scheduled", ...base, delayMs: delay });
      setTimeout(() => {
        this.ready.push(job);
        this.pump();
      }, delay);
    }
    this.pump();
  }
}
