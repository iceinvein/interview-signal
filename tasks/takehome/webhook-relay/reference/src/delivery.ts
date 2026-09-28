import type { TenantConfig } from "./config.ts";

export type RelayEvent = {
  id: string;
  tenantId: string;
  body: Buffer;
  contentType: string | undefined;
};

export type DeliveryOutcome = { delivered: boolean; attempts: number };

export type DeliveryDeps = {
  send: (destination: string, event: RelayEvent) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
};

/** Wait before retry number `retry` (1 for the first retry). */
export function backoffDelayMs(initialBackoffMs: number, retry: number): number {
  return initialBackoffMs * 2 ** (retry - 1);
}

export async function deliverWithRetry(
  event: RelayEvent,
  policy: Pick<TenantConfig, "destination" | "maxAttempts" | "initialBackoffMs">,
  deps: DeliveryDeps,
): Promise<DeliveryOutcome> {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (attempt > 1) await deps.sleep(backoffDelayMs(policy.initialBackoffMs, attempt - 1));
    if (await deps.send(policy.destination, event)) return { delivered: true, attempts: attempt };
  }
  return { delivered: false, attempts: policy.maxAttempts };
}
