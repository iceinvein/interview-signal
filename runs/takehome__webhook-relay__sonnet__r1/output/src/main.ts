import { systemClock } from "./clock.ts";
import { loadTenants } from "./config.ts";
import { jsonLogger } from "./logger.ts";
import { Relay } from "./relay.ts";
import { httpSender } from "./sender.ts";
import { createRelayServer } from "./server.ts";

const ATTEMPT_TIMEOUT_MS = 10_000;

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || port > 65535 || !tenantsFile) {
  console.error("PORT (0-65535) and TENANTS_FILE must be set");
  process.exit(1);
}

let tenants;
try {
  tenants = loadTenants(tenantsFile);
} catch (err) {
  console.error(`failed to load ${tenantsFile}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const relay = new Relay({
  tenants,
  send: httpSender(ATTEMPT_TIMEOUT_MS),
  clock: systemClock,
  logger: jsonLogger,
});
const server = createRelayServer({ relay, logger: jsonLogger });

server.listen(port, () => jsonLogger.info("listening", { port, tenants: tenants.size }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // State is in memory, so undelivered webhooks are lost on exit.
    jsonLogger.info("shutting down", { signal, undelivered: relay.pendingCount() });
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
