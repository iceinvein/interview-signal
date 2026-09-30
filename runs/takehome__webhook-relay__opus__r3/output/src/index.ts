import { systemClock } from "./clock.ts";
import { loadTenantsFile } from "./config.ts";
import { fetchSender } from "./delivery.ts";
import { jsonLogger } from "./logger.ts";
import { Relay } from "./relay.ts";
import { createRelayServer } from "./server.ts";

const logger = jsonLogger();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error(`${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

const port = Number(requireEnv("PORT"));
const tenants = loadTenantsFile(requireEnv("TENANTS_FILE"));

const relay = new Relay(tenants, {
  clock: systemClock,
  sender: fetchSender(10_000),
  logger,
  concurrencyPerTenant: 10,
  maxPendingPerTenant: 10_000,
});
const server = createRelayServer({ relay, logger, maxBodyBytes: 1024 * 1024 });

server.listen(port, () => {
  logger.info("listening", { port, tenants: tenants.size });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    logger.info("shutting down", { signal });
    server.close(() => process.exit(0));
  });
}
