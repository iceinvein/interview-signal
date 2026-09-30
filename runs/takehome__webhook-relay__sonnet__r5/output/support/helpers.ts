import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { TenantConfig } from "../src/config.ts";

export const tenant = (over: Partial<TenantConfig> = {}): TenantConfig => ({
  destination: "http://dest.invalid/hook",
  maxAttempts: 3,
  initialBackoffMs: 1000,
  requestsPerSecond: 5,
  ...over,
});

/** Lets pending promise continuations run (mock timers do not touch microtasks). */
export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
