import type { TenantConfig } from "./config.ts";
import type { Logger } from "./log.ts";

export interface Delivery {
  id: string;
  body: Buffer;
  contentType: string | undefined;
}

/** Resolves with the destination's HTTP status; rejects on connection errors/timeouts. */
export type Sender = (destination: string, delivery: Delivery) => Promise<number>;

/** Returns a function that cancels the timer. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

export interface DispatcherOptions {
  tenantId: string;
  config: TenantConfig;
  send: Sender;
  setTimer: SetTimer;
  log: Logger;
  /** Max simultaneous in-flight requests to this tenant's destination. */
  concurrency: number;
  /** Cap on bytes of undelivered events held in memory for this tenant. */
  maxQueuedBytes: number;
}

interface Job {
  delivery: Delivery;
  attempts: number;
  cost: number;
}

const JOB_OVERHEAD_BYTES = 1024;

/**
 * Delivery state for ONE tenant. Each tenant owns its own instance, so a slow or dead
 * destination can only exhaust that tenant's concurrency and queue budget.
 * Events waiting out a backoff hold a timer, not a concurrency slot, so they never
 * block newer events for the same tenant.
 */
export class TenantDispatcher {
  private readonly o: DispatcherOptions;
  private readonly ready: Job[] = [];
  private readonly cancelTimers = new Set<() => void>();
  private inFlight = 0;
  private queuedBytes = 0;
  private closed = false;

  constructor(options: DispatcherOptions) {
    this.o = options;
  }

  hasCapacity(bodyBytes: number): boolean {
    return !this.closed && this.queuedBytes + bodyBytes + JOB_OVERHEAD_BYTES <= this.o.maxQueuedBytes;
  }

  /** Caller must have checked hasCapacity(). */
  enqueue(delivery: Delivery): void {
    const cost = delivery.body.length + JOB_OVERHEAD_BYTES;
    this.queuedBytes += cost;
    this.ready.push({ delivery, attempts: 0, cost });
    this.pump();
  }

  close(): void {
    this.closed = true;
    for (const cancel of this.cancelTimers) cancel();
    this.cancelTimers.clear();
  }

  private pump(): void {
    while (!this.closed && this.inFlight < this.o.concurrency && this.ready.length > 0) {
      void this.attempt(this.ready.shift()!);
    }
  }

  private async attempt(job: Job): Promise<void> {
    const { tenantId, config, log } = this.o;
    const webhookId = job.delivery.id;
    job.attempts++;
    this.inFlight++;
    let status: number | undefined;
    let failure: string;
    try {
      status = await this.o.send(config.destination, job.delivery);
      failure = `status ${status}`;
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    this.inFlight--;

    if (status !== undefined && status >= 200 && status < 300) {
      log("delivered", { tenantId, webhookId, attempt: job.attempts, status });
      this.release(job);
      return;
    }

    if (job.attempts >= config.maxAttempts) {
      log("gave_up", { tenantId, webhookId, attempts: job.attempts, failure });
      this.release(job);
    } else {
      // Wait initialBackoffMs before the 1st retry, doubling for each retry after.
      const delayMs = config.initialBackoffMs * 2 ** (job.attempts - 1);
      log("retry_scheduled", { tenantId, webhookId, attempt: job.attempts, failure, delayMs });
      const cancel = this.o.setTimer(() => {
        this.cancelTimers.delete(cancel);
        this.ready.push(job);
        this.pump();
      }, delayMs);
      this.cancelTimers.add(cancel);
    }
    this.pump();
  }

  private release(job: Job): void {
    this.queuedBytes -= job.cost;
    this.pump();
  }
}
