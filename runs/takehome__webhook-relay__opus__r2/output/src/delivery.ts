import type { TenantConfig } from "./config.ts";
import type { Logger } from "./logger.ts";

export interface Webhook {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
}

export interface OutboundRequest {
  url: URL;
  body: Buffer;
  headers: Record<string, string>;
}

/** Resolves with the HTTP status; rejects on connection errors and timeouts. */
export type Sender = (request: OutboundRequest) => Promise<number>;
export type Sleep = (ms: number) => Promise<void>;

export interface QueueLimits {
  /** Concurrent in-flight HTTP attempts to this tenant's destination. */
  maxConcurrent: number;
  /** Webhooks accepted but not yet delivered or abandoned (includes ones waiting to retry). */
  maxPending: number;
}

/** Wait before retry number `retry` (1-based): initial, 2x, 4x, ... */
export function backoffMs(initialBackoffMs: number, retry: number): number {
  return initialBackoffMs * 2 ** (retry - 1);
}

/**
 * Delivers one tenant's webhooks. Each tenant gets its own queue, so a slow or failing
 * destination only ever consumes that tenant's concurrency and pending budget.
 */
export class TenantDeliveryQueue {
  readonly #tenantId: string;
  readonly #config: TenantConfig;
  readonly #send: Sender;
  readonly #sleep: Sleep;
  readonly #logger: Logger;
  readonly #limits: QueueLimits;
  readonly #inFlight = new Set<Promise<void>>();
  readonly #waitingForSlot: Array<() => void> = [];
  #activeAttempts = 0;

  constructor(
    tenantId: string,
    config: TenantConfig,
    deps: { send: Sender; sleep: Sleep; logger: Logger; limits: QueueLimits },
  ) {
    this.#tenantId = tenantId;
    this.#config = config;
    this.#send = deps.send;
    this.#sleep = deps.sleep;
    this.#logger = deps.logger;
    this.#limits = deps.limits;
  }

  get pending(): number {
    return this.#inFlight.size;
  }

  /** Returns false, without taking ownership, if this tenant's backlog is full. */
  enqueue(webhook: Webhook): boolean {
    if (this.#inFlight.size >= this.#limits.maxPending) return false;
    const job = this.#deliver(webhook).finally(() => this.#inFlight.delete(job));
    this.#inFlight.add(job);
    return true;
  }

  /** Resolves once every webhook enqueued so far has been delivered or abandoned. */
  async whenIdle(): Promise<void> {
    while (this.#inFlight.size > 0) await Promise.all(this.#inFlight);
  }

  async #deliver(webhook: Webhook): Promise<void> {
    const { maxAttempts, initialBackoffMs } = this.#config;
    for (let attempt = 1; ; attempt++) {
      const result = await this.#withSlot(() => this.#attempt(webhook));
      const fields = { tenantId: this.#tenantId, webhookId: webhook.id, attempt, ...result };

      if (result.delivered) {
        this.#logger.info("delivery.succeeded", fields);
        return;
      }
      if (attempt >= maxAttempts) {
        this.#logger.error("delivery.abandoned", fields);
        return;
      }
      const waitMs = backoffMs(initialBackoffMs, attempt);
      this.#logger.warn("delivery.failed", { ...fields, retryInMs: waitMs });
      // The slot is released while we wait, so retries never block fresh webhooks.
      await this.#sleep(waitMs);
    }
  }

  async #attempt(
    webhook: Webhook,
  ): Promise<{ delivered: boolean; status?: number; error?: string }> {
    const headers: Record<string, string> = { "x-webhook-id": webhook.id };
    if (webhook.contentType !== undefined) headers["content-type"] = webhook.contentType;
    try {
      const status = await this.#send({ url: this.#config.destination, body: webhook.body, headers });
      return { delivered: status >= 200 && status < 300, status };
    } catch (err) {
      return { delivered: false, error: errorMessage(err) };
    }
  }

  async #withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#activeAttempts >= this.#limits.maxConcurrent) {
      await new Promise<void>((resolve) => this.#waitingForSlot.push(resolve));
    } else {
      this.#activeAttempts++;
    }
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next waiter, or give it back.
      const next = this.#waitingForSlot.shift();
      if (next) next();
      else this.#activeAttempts--;
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
    return `${err.name}: ${err.message}${cause}`;
  }
  return String(err);
}

/** Real sender: no redirects followed (a 3xx is a failed attempt), per-attempt timeout. */
export function fetchSender(timeoutMs: number): Sender {
  return async ({ url, body, headers }) => {
    const response = await fetch(url, {
      method: "POST",
      // Buffers we build are ArrayBuffer-backed; the DOM typings just cannot see that.
      body: body as Uint8Array<ArrayBuffer>,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Discard the destination's response body; we only care about the status.
    await response.body?.cancel();
    return response.status;
  };
}
