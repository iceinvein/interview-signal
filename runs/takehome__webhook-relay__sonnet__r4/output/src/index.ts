import { loadTenants } from "./config.ts";
import { jsonLogger } from "./log.ts";
import { httpSender } from "./sender.ts";
import { createRelay } from "./server.ts";

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  console.error("PORT and TENANTS_FILE environment variables are required");
  process.exit(1);
}

const tenants = loadTenants(tenantsFile);
const relay = createRelay({
  tenants,
  send: httpSender(10_000),
  log: jsonLogger,
});

relay.server.listen(port, () => {
  jsonLogger("listening", { port, tenants: tenants.size });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    jsonLogger("shutdown", { signal });
    void relay.close().then(() => process.exit(0));
  });
}
