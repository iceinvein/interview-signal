import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { loadTenants } from "./config.ts";
import { deliverWithRetry, type RelayEvent } from "./delivery.ts";
import { forwardToDestination } from "./forward.ts";
import { createRelayServer, type LogLine } from "./server.ts";

// Long enough for a slow destination, short enough that a hung one still
// counts as a failed attempt and the retry schedule moves on.
const DELIVERY_TIMEOUT_MS = 10_000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function log(line: LogLine): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...line })}\n`);
}

const port = Number(requiredEnv("PORT"));
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a port number");
const tenants = loadTenants(requiredEnv("TENANTS_FILE"));

function dispatch(event: RelayEvent): void {
  const tenant = tenants.get(event.tenantId);
  if (tenant === undefined) throw new Error(`dispatch for unknown tenant ${event.tenantId}`);
  // Each event is its own promise, so one tenant's slow destination never
  // holds up another's deliveries. There is no ordering guarantee (see README).
  void deliverWithRetry(event, tenant, {
    send: (url, e) => forwardToDestination(url, e, DELIVERY_TIMEOUT_MS),
    sleep: (ms) => sleep(ms),
  }).then(({ delivered, attempts }) => {
    const base = { tenant: event.tenantId, eventId: event.id, attempts };
    if (delivered) log({ msg: "delivery.succeeded", ...base });
    else log({ msg: "delivery.abandoned", ...base });
  });
}

const server = createRelayServer({ tenants, now: () => performance.now(), newEventId: randomUUID, dispatch, log });
server.listen(port, "localhost", () => log({ msg: "relay.listening", port, tenants: [...tenants.keys()] }));
