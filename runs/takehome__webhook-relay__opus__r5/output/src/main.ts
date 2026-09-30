import { loadTenantsFile } from "./config.ts";
import { createHttpSender } from "./http-sender.ts";
import { jsonLogger } from "./log.ts";
import { createRelay } from "./relay.ts";

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  console.error("PORT and TENANTS_FILE must be set");
  process.exit(1);
}

const tenants = await loadTenantsFile(tenantsFile);
const server = createRelay({
  tenants,
  send: createHttpSender(10_000),
  log: jsonLogger,
});

server.listen(port, () => {
  jsonLogger("listening", { port, tenants: [...tenants.keys()] });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    jsonLogger("shutting_down", { signal });
    // In-memory state: anything not yet delivered is lost. See README.
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
