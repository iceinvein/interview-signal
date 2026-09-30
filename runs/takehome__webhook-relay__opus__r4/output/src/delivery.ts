import type { Clock } from "./clock.ts";
import type { TenantConfig } from "./config.ts";
import { redactUrl, type Logger } from "./logger.ts";

export interface WebhookEvent {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
}

export interface OutboundRequest {
  url: URL;
  webhookId: string;
  body: Buffer;
  contentType: string | undefined;
}

/** `ok` means the destination returned 2xx. Senders must not throw. */
export type AttemptResult = { ok: true; status: number } | { ok: false; status?: number; error?: string };
export type Sender = (req: OutboundRequest) => Promise<AttemptResult>;

export interface QueueLimits {
  /** Deliveries in flight at once for one tenant. */
  concurrency: number;
  /** Accepted-but-unfinished events (queued, in flight, or waiting to retry) per tenant. */
  maxPending: number;
}

/** Delay before retry number `retry` (1-based): initial, 2x, 4x, ... */
export function backoffMs(initialBackoffMs: number, retry: number): number {
  return initialBackoffMs * 2 ** (retry - 1);
}

/**
 * Delivery pipeline for a single tenant. Each tenant gets its own instance, so
 * a slow or failing destination can only use up its own concurrency slots and
 * its own pending budget; other tenants never wait behind it.
 */
export class TenantQueue {
  readonly #tenantId: string;
  readonly #config: TenantConfig;
  readonly #limits: QueueLimits;
  readonly #send: Sender;
  readonly #clock: Clock;
  readonly #log: Logger;

  readonly #ready: { event: WebhookEvent; attempt: number }[] = [];
  #inFlight = 0;
  #pending = 0;

  constructor(tenantId: string, config: TenantConfig, limits: QueueLimits, send: Sender, clock: Clock, log: Logger) {
    this.#tenantId = tenantId;
    this.#config = config;
    this.#limits = limits;
    this.#send = send;
    this.#clock = clock;
    this.#log = log;
  }

  get pending(): number {
    return this.#pending;
  }

  /** Returns false (and takes ownership of nothing) if the tenant's backlog is full. */
  enqueue(event: WebhookEvent): boolean {
    if (this.#pending >= this.#limits.maxPending) return false;
    this.#pending++;
    this.#ready.push({ event, attempt: 1 });
    this.#pump();
    return true;
  }

  #pump(): void {
    while (this.#inFlight < this.#limits.concurrency && this.#ready.length > 0) {
      const next = this.#ready.shift()!;
      this.#inFlight++;
      void this.#attempt(next.event, next.attempt);
    }
  }

  async #attempt(event: WebhookEvent, attempt: number): Promise<void> {
    const { destination, maxAttempts, initialBackoffMs } = this.#config;
    let result: AttemptResult;
    try {
      result = await this.#send({
        url: destination,
        webhookId: event.id,
        body: event.body,
        contentType: event.contentType,
      });
    } catch (err) {
      // Defensive: a sender bug must not leak a concurrency slot.
      result = { ok: false, error: (err as Error).message };
    }
    this.#inFlight--;

    const fields = {
      tenantId: this.#tenantId,
      webhookId: event.id,
      attempt,
      maxAttempts,
      destination: redactUrl(destination),
      status: result.status,
      error: result.ok ? undefined : result.error,
    };

    if (result.ok) {
      this.#pending--;
      this.#log.info("delivered", fields);
    } else if (attempt >= maxAttempts) {
      this.#pending--;
      this.#log.error("delivery abandoned", fields);
    } else {
      const delay = backoffMs(initialBackoffMs, attempt);
      this.#log.warn("delivery attempt failed", { ...fields, retryInMs: delay });
      // The event does not hold a concurrency slot while it waits.
      this.#clock.setTimeout(() => {
        this.#ready.push({ event, attempt: attempt + 1 });
        this.#pump();
      }, delay);
    }
    this.#pump();
  }
}
