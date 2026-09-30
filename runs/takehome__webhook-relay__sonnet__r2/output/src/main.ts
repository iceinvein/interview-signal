import { loadTenants } from "./config.ts";
import { httpSend } from "./relay.ts";
import { createRelayServer } from "./server.ts";
import { jsonLogger, systemClock } from "./types.ts";

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  console.error("PORT and TENANTS_FILE environment variables are required");
  process.exit(1);
}

const tenants = loadTenants(tenantsFile);
const { server, relay } = createRelayServer({
  tenants,
  send: httpSend(),
  clock: systemClock,
  log: jsonLogger,
});

server.listen(port, () => {
  jsonLogger({ msg: "listening", port, tenants: tenants.size });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // State is in memory: anything still retrying is lost on exit.
    jsonLogger({ msg: "shutting down", signal, undeliveredWebhooks: relay.pending });
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
