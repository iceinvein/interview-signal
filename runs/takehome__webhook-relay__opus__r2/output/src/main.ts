import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "./app.ts";
import { loadTenants } from "./config.ts";
import { fetchSender } from "./delivery.ts";
import { jsonLogger } from "./logger.ts";

const logger = jsonLogger();

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  logger.error("startup.failed", { reason: "PORT and TENANTS_FILE must be set" });
  process.exit(1);
}

const tenants = await loadTenants(tenantsFile);

const app = createApp({
  tenants,
  send: fetchSender(10_000),
  sleep: (ms) => sleep(ms),
  now: () => performance.now(),
  logger,
  limits: { maxConcurrent: 10, maxPending: 10_000 },
  maxBodyBytes: 1024 * 1024,
});

app.server.listen(port, () => {
  logger.info("startup.listening", { port, tenants: tenants.size });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    // Stop taking new webhooks. In-memory retries still pending are lost on exit;
    // see "Durability" in the README.
    logger.info("shutdown.started", { signal });
    app.server.close(() => process.exit(0));
    app.server.closeIdleConnections();
  });
}
