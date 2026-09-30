import { systemClock } from "./clock.ts";
import { loadTenants } from "./config.ts";
import { jsonLogger } from "./logger.ts";
import { Relay } from "./relay.ts";
import { httpSender } from "./sender.ts";
import { createApp } from "./server.ts";

const port = Number(process.env.PORT);
const file = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !file) {
  console.error("PORT and TENANTS_FILE environment variables are required");
  process.exit(1);
}

const tenants = loadTenants(file); // throws (and exits non-zero) on invalid config
const relay = new Relay(tenants, httpSender(), systemClock, jsonLogger);
const server = createApp(relay, jsonLogger).listen(port, () => {
  jsonLogger("listening", { port, tenants: tenants.size });
});

// State is in memory, so pending retries are lost on shutdown; stop taking new work and exit.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    jsonLogger("shutdown", { signal: sig });
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
