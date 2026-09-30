import type { Clock } from './clock.ts';
import type { TenantConfig } from './config.ts';
import type { Logger } from './log.ts';

export interface Webhook {
  id: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string | undefined;
}

export interface OutboundRequest {
  url: string;
  webhookId: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string | undefined;
}

/** `ok` means the destination returned 2xx. Senders must not throw. */
export type SendResult = { ok: boolean; status?: number; error?: string };
export type Sender = (req: OutboundRequest) => Promise<SendResult>;

export interface DeliveryLimits {
  /** Maximum simultaneous outbound requests for one tenant. */
  concurrency: number;
  /** Maximum webhooks one tenant may have in the relay (queued, in flight, or waiting to retry). */
  maxBacklog: number;
}

interface Job {
  webhook: Webhook;
  /** Attempts made so far. */
  attempts: number;
}

/** Wait before retry number `retry` (1-based): initialBackoffMs, then doubling. */
export function backoffMs(initialBackoffMs: number, retry: number): number {
  return initialBackoffMs * 2 ** (retry - 1);
}

/**
 * Owns delivery for exactly one tenant. Each tenant gets its own queue,
 * concurrency budget and backlog cap, so a slow or failing destination can
 * only ever consume its own tenant's capacity.
 */
export class TenantDelivery {
  readonly #tenantId: string;
  readonly #config: TenantConfig;
  readonly #limits: DeliveryLimits;
  readonly #send: Sender;
  readonly #clock: Clock;
  readonly #log: Logger;

  readonly #ready: Job[] = [];
  #inFlight = 0;
  #backlog = 0;

  constructor(
    tenantId: string,
    config: TenantConfig,
    deps: { limits: DeliveryLimits; send: Sender; clock: Clock; log: Logger },
  ) {
    this.#tenantId = tenantId;
    this.#config = config;
    this.#limits = deps.limits;
    this.#send = deps.send;
    this.#clock = deps.clock;
    this.#log = deps.log;
  }

  /** Number of webhooks this tenant currently has in the relay. */
  get backlog(): number {
    return this.#backlog;
  }

  /** Returns false (and takes no ownership) if the tenant's backlog is full. */
  enqueue(webhook: Webhook): boolean {
    if (this.#backlog >= this.#limits.maxBacklog) return false;
    this.#backlog++;
    this.#ready.push({ webhook, attempts: 0 });
    this.#pump();
    return true;
  }

  #pump(): void {
    while (this.#inFlight < this.#limits.concurrency && this.#ready.length > 0) {
      const job = this.#ready.shift()!;
      this.#inFlight++;
      void this.#attempt(job).finally(() => {
        this.#inFlight--;
        this.#pump();
      });
    }
  }

  async #attempt(job: Job): Promise<void> {
    job.attempts++;
    const { webhook } = job;
    const result = await this.#send({
      url: this.#config.destination,
      webhookId: webhook.id,
      body: webhook.body,
      contentType: webhook.contentType,
    }).catch((err: unknown): SendResult => ({ ok: false, error: String(err) }));

    const fields = {
      tenantId: this.#tenantId,
      webhookId: webhook.id,
      attempt: job.attempts,
      maxAttempts: this.#config.maxAttempts,
      status: result.status,
      error: result.error,
    };

    if (result.ok) {
      this.#backlog--;
      this.#log('info', 'webhook delivered', fields);
      return;
    }
    if (job.attempts >= this.#config.maxAttempts) {
      this.#backlog--;
      this.#log('error', 'webhook delivery abandoned', fields);
      return;
    }
    const delayMs = backoffMs(this.#config.initialBackoffMs, job.attempts);
    this.#log('warn', 'webhook delivery failed, will retry', { ...fields, retryInMs: delayMs });
    // The job keeps its backlog slot while waiting but frees its concurrency slot.
    this.#clock.setTimeout(() => {
      this.#ready.push(job);
      this.#pump();
    }, delayMs);
  }
}
