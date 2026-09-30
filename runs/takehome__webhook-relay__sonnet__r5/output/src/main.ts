import { loadTenants } from "./config.ts";
import type { Send } from "./dispatcher.ts";
import { createRelay } from "./relay.ts";

const port = Number(process.env.PORT);
const tenantsFile = process.env.TENANTS_FILE;
if (!Number.isInteger(port) || port < 0 || !tenantsFile) {
  console.error("PORT and TENANTS_FILE environment variables are required");
  process.exit(1);
}
const deliveryTimeoutMs = Number(process.env.DELIVERY_TIMEOUT_MS ?? 10_000);

const send: Send = async (destination, webhook) => {
  const headers: Record<string, string> = { "X-Webhook-Id": webhook.id };
  if (webhook.contentType) headers["Content-Type"] = webhook.contentType;
  const res = await fetch(destination, {
    method: "POST",
    headers,
    body: new Uint8Array(webhook.body),
    redirect: "manual", // a redirect is not a 2xx, and following it would silently re-send as GET
    signal: AbortSignal.timeout(deliveryTimeoutMs),
  });
  await res.body?.cancel(); // release the connection; we only need the status
  return res.status;
};

// Structured, one JSON object per line. Bodies and headers are deliberately never logged (see README).
const log = (event: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));

const server = createRelay({ tenants: loadTenants(tenantsFile), send, log });
server.listen(port, () => log({ event: "listening", port: (server.address() as { port: number }).port }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log({ event: "shutdown", signal });
    server.close();
    server.closeAllConnections();
    process.exit(0); // pending in-memory deliveries are dropped; see README
  });
}
