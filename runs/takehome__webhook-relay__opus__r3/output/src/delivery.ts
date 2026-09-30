import type { Clock } from "./clock.ts";
import type { TenantConfig } from "./config.ts";
import type { Logger } from "./logger.ts";

export interface Webhook {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
}

export type SendOutcome = { ok: true; status: number } | { ok: false; status?: number; error?: string };

/** Performs one delivery attempt. Must not throw; failures are reported in the outcome. */
export type Sender = (url: string, headers: Record<string, string>, body: Buffer) => Promise<SendOutcome>;

export function fetchSender(timeoutMs: number): Sender {
  return async (url, headers, body) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        // Buffer is a Uint8Array; the cast only narrows the ArrayBufferLike generic.
        body: body as Uint8Array<ArrayBuffer>,
        // A redirect is not a 2xx, so it is a failed attempt. Following it would
        // also re-send tenant secrets to a host that isn't the configured one.
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Release the connection; we don't need the response body.
      await res.body?.cancel().catch(() => {});
      return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status };
    } catch (err) {
      const e = err as Error & { cause?: { code?: string; message?: string } };
      return { ok: false, error: e.name === "TimeoutError" ? "timeout" : (e.cause?.code ?? e.cause?.message ?? e.message) };
    }
  };
}

export interface DispatcherOptions {
  clock: Clock;
  sender: Sender;
  logger: Logger;
  /** Max concurrent in-flight requests to this tenant's destination. */
  concurrency: number;
  /** Max webhooks accepted but not yet finished (queued, in flight, or awaiting retry). */
  maxPending: number;
}

interface Job {
  webhook: Webhook;
  attempt: number;
}

/**
 * Delivers one tenant's webhooks. Each tenant gets its own dispatcher, with its
 * own concurrency and backlog limits, so a slow or failing destination can
 * only ever tie up that tenant's capacity.
 *
 * A job waiting out a backoff holds no concurrency slot, so retries of one bad
 * event don't block the tenant's other events either.
 */
export class TenantDispatcher {
  readonly #tenant: TenantConfig;
  readonly #opts: DispatcherOptions;
  readonly #ready: Job[] = [];
  #inFlight = 0;
  #pending = 0;

  constructor(tenant: TenantConfig, opts: DispatcherOptions) {
    this.#tenant = tenant;
    this.#opts = opts;
  }

  get pending(): number {
    return this.#pending;
  }

  hasCapacity(): boolean {
    return this.#pending < this.#opts.maxPending;
  }

  enqueue(webhook: Webhook): void {
    this.#pending++;
    this.#ready.push({ webhook, attempt: 1 });
    this.#pump();
  }

  #pump(): void {
    while (this.#inFlight < this.#opts.concurrency && this.#ready.length > 0) {
      const job = this.#ready.shift()!;
      this.#inFlight++;
      void this.#attempt(job);
    }
  }

  async #attempt(job: Job): Promise<void> {
    const { webhook, attempt } = job;
    const headers: Record<string, string> = { "x-webhook-id": webhook.id };
    if (webhook.contentType !== undefined) headers["content-type"] = webhook.contentType;

    const outcome = await this.#opts.sender(this.#tenant.destination, headers, webhook.body);
    this.#inFlight--;

    const fields = { webhookId: webhook.id, tenantId: webhook.tenantId, attempt, status: outcome.status };
    if (outcome.ok) {
      this.#pending--;
      this.#opts.logger.info("delivered", fields);
    } else if (attempt >= this.#tenant.maxAttempts) {
      this.#pending--;
      this.#opts.logger.error("delivery abandoned", { ...fields, error: outcome.error });
    } else {
      const delayMs = backoffMs(this.#tenant.initialBackoffMs, attempt);
      this.#opts.logger.warn("delivery failed, will retry", { ...fields, error: outcome.error, retryInMs: delayMs });
      this.#opts.clock.setTimeout(() => {
        this.#ready.push({ webhook, attempt: attempt + 1 });
        this.#pump();
      }, delayMs);
    }
    this.#pump();
  }
}

/** Wait before retry number `failedAttempt` (1-based): initial, 2x, 4x, ... */
export function backoffMs(initialBackoffMs: number, failedAttempt: number): number {
  return initialBackoffMs * 2 ** (failedAttempt - 1);
}
