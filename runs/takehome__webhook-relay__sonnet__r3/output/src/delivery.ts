import type { Clock } from "./clock.ts";
import type { TenantConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { Sender } from "./sender.ts";

export interface Job {
  id: string;
  tenantId: string;
  tenant: TenantConfig;
  body: Buffer;
  contentType: string | undefined;
}

/**
 * Runs one webhook to completion: attempt, then retry with exponential backoff
 * (initialBackoffMs, x2 each retry) until a 2xx or maxAttempts is exhausted.
 * Each job has its own timer chain, so jobs never wait on each other.
 */
export class Deliverer {
  private readonly send: Sender;
  private readonly clock: Clock;
  private readonly log: Logger;

  constructor(send: Sender, clock: Clock, log: Logger) {
    this.send = send;
    this.clock = clock;
    this.log = log;
  }

  /** Resolves (never rejects) once the job is delivered or abandoned. */
  run(job: Job): Promise<void> {
    return new Promise((resolve) => this.attempt(job, 1, resolve));
  }

  private attempt(job: Job, n: number, done: () => void): void {
    const base = { webhookId: job.id, tenant: job.tenantId, attempt: n };
    this.send({ url: job.tenant.destination, id: job.id, body: job.body, contentType: job.contentType }).then(
      ({ status }) => (status >= 200 && status < 300 ? { ok: true as const, status } : { ok: false as const, status }),
      (err: any) => ({ ok: false as const, error: String(err?.cause?.code ?? err?.name ?? "error") }),
    ).then((result) => {
      if (result.ok) {
        this.log("delivered", { ...base, status: result.status });
        return done();
      }
      const why = "status" in result ? { status: result.status } : { error: result.error };
      if (n >= job.tenant.maxAttempts) {
        this.log("gave_up", { ...base, ...why });
        return done();
      }
      const delayMs = job.tenant.initialBackoffMs * 2 ** (n - 1);
      this.log("retry_scheduled", { ...base, ...why, delayMs });
      this.clock.setTimeout(() => this.attempt(job, n + 1, done), delayMs);
    });
  }
}
