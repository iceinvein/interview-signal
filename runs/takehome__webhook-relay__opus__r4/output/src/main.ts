import { systemClock } from "./clock.ts";
import { loadTenantsFile } from "./config.ts";
import { httpSender } from "./httpSender.ts";
import { jsonLogger, redactUrl } from "./logger.ts";
import { createRelayServer } from "./server.ts";

const log = jsonLogger();

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  log.error("PORT and TENANTS_FILE must be set");
  process.exit(1);
}

let tenants;
try {
  tenants = loadTenantsFile(tenantsFile);
} catch (err) {
  log.error("invalid tenant configuration", { error: (err as Error).message });
  process.exit(1);
}

const server = createRelayServer({
  tenants,
  send: httpSender({ timeoutMs: 10_000 }),
  clock: systemClock,
  log,
  maxBodyBytes: 1024 * 1024,
  queue: { concurrency: 4, maxPending: 1000 },
});

server.listen(port, () => {
  log.info("listening", {
    port,
    tenants: [...tenants].map(([id, t]) => ({ id, destination: redactUrl(t.destination) })),
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    log.info("shutting down", { signal });
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}
