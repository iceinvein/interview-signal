import type { TenantConfig } from "./config.ts";

export interface Webhook {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
}

/** Performs one delivery attempt and resolves with the HTTP status. Rejects on network errors/timeouts. */
export type Sender = (destination: URL, webhook: Webhook) => Promise<number>;

/** Injected so tests can control time; defaults to setTimeout. */
export type Schedule = (fn: () => void, delayMs: number) => void;

export type DeliveryEvent = {
  webhookId: string;
  tenantId: string;
  attempt: number;
  status?: number;
  error?: string;
} & (
  | { outcome: "delivered" }
  | { outcome: "retrying"; retryInMs: number }
  | { outcome: "gave_up" }
);

export interface DispatcherOptions {
  send: Sender;
  schedule?: Schedule;
  onEvent?: (event: DeliveryEvent) => void;
  /** Max attempts in flight at once for this tenant. */
  maxConcurrency: number;
  /** Max webhooks held (queued, in flight or waiting to retry) for this tenant. */
  maxPending: number;
}

interface Job {
  webhook: Webhook;
  attempts: number;
}

export function backoffMs(initialBackoffMs: number, failedAttempts: number): number {
  return initialBackoffMs * 2 ** (failedAttempts - 1);
}

/**
 * Delivery for a single tenant. Each tenant gets its own dispatcher with its
 * own concurrency and queue limits, so a slow or failing destination can only
 * exhaust its own tenant's capacity.
 */
export class TenantDispatcher {
  readonly #config: TenantConfig;
  readonly #send: Sender;
  readonly #schedule: Schedule;
  readonly #onEvent: (event: DeliveryEvent) => void;
  readonly #maxConcurrency: number;
  readonly #maxPending: number;
  readonly #ready: Job[] = [];
  #inFlight = 0;
  #pending = 0;

  constructor(config: TenantConfig, options: DispatcherOptions) {
    this.#config = config;
    this.#send = options.send;
    this.#schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.#onEvent = options.onEvent ?? (() => {});
    this.#maxConcurrency = options.maxConcurrency;
    this.#maxPending = options.maxPending;
  }

  get pending(): number {
    return this.#pending;
  }

  hasCapacity(): boolean {
    return this.#pending < this.#maxPending;
  }

  /** Returns false (and drops the webhook) if the tenant's backlog is full. */
  enqueue(webhook: Webhook): boolean {
    if (!this.hasCapacity()) return false;
    this.#pending++;
    this.#ready.push({ webhook, attempts: 0 });
    this.#pump();
    return true;
  }

  #pump(): void {
    while (this.#inFlight < this.#maxConcurrency && this.#ready.length > 0) {
      void this.#attempt(this.#ready.shift()!);
    }
  }

  async #attempt(job: Job): Promise<void> {
    this.#inFlight++;
    job.attempts++;
    let status: number | undefined;
    let error: string | undefined;
    try {
      status = await this.#send(this.#config.destination, job.webhook);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      this.#inFlight--;
    }

    const base = {
      webhookId: job.webhook.id,
      tenantId: job.webhook.tenantId,
      attempt: job.attempts,
      status,
      error,
    };
    if (status !== undefined && status >= 200 && status < 300) {
      this.#pending--;
      this.#onEvent({ ...base, outcome: "delivered" });
    } else if (job.attempts >= this.#config.maxAttempts) {
      this.#pending--;
      this.#onEvent({ ...base, outcome: "gave_up" });
    } else {
      const retryInMs = backoffMs(this.#config.initialBackoffMs, job.attempts);
      this.#onEvent({ ...base, outcome: "retrying", retryInMs });
      this.#schedule(() => {
        this.#ready.push(job);
        this.#pump();
      }, retryInMs);
    }
    this.#pump();
  }
}
