import type { TenantConfig, Tenants } from './config.js';

export interface Webhook {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType?: string;
}

export type Logger = (record: Record<string, unknown>) => void;
export type Post = (destination: string, webhook: Webhook) => Promise<number>;
export type Sleep = (ms: number) => Promise<void>;

export async function sleep(ms: number): Promise<void> {
  // setTimeout clamps values above 2^31-1 to 1 ms; split long waits instead.
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 2_147_483_647);
    await new Promise<void>((resolve) => setTimeout(resolve, chunk));
    remaining -= chunk;
  }
}

interface Worker {
  config: TenantConfig;
  queue: Webhook[];
  running: boolean;
}

export class DeliveryQueue {
  private readonly workers = new Map<string, Worker>();

  constructor(tenants: Tenants, private readonly post: Post, private readonly log: Logger,
    private readonly wait: Sleep = sleep) {
    for (const [id, config] of Object.entries(tenants)) {
      this.workers.set(id, { config, queue: [], running: false });
    }
  }

  enqueue(webhook: Webhook): void {
    const worker = this.workers.get(webhook.tenantId);
    if (!worker) throw new Error(`Unknown tenant: ${webhook.tenantId}`);
    worker.queue.push(webhook);
    if (!worker.running) {
      worker.running = true;
      queueMicrotask(() => { void this.run(worker); });
    }
  }

  private async run(worker: Worker): Promise<void> {
    try {
      while (worker.queue.length > 0) {
        const webhook = worker.queue[0]!;
        await this.deliver(worker.config, webhook);
        worker.queue.shift();
      }
    } finally {
      worker.running = false;
      if (worker.queue.length > 0) {
        worker.running = true;
        queueMicrotask(() => { void this.run(worker); });
      }
    }
  }

  private async deliver(config: TenantConfig, webhook: Webhook): Promise<void> {
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      let status: number | undefined;
      try {
        status = await this.post(config.destination, webhook);
      } catch {
        // Connection and timeout errors are failed attempts.
      }
      const delivered = status !== undefined && status >= 200 && status < 300;
      this.log({ event: 'delivery_attempt', tenantId: webhook.tenantId,
        webhookId: webhook.id, attempt, status: status ?? null, delivered });
      if (delivered) return;
      if (attempt < config.maxAttempts) {
        await this.wait(config.initialBackoffMs * 2 ** (attempt - 1));
      }
    }
    this.log({ event: 'delivery_exhausted', tenantId: webhook.tenantId, webhookId: webhook.id });
  }
}
