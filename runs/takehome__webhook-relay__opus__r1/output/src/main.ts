import { systemClock } from './clock.ts';
import { ConfigError, loadTenants } from './config.ts';
import { createHttpSender } from './httpSender.ts';
import { jsonLogger as log } from './log.ts';
import { createRelayServer, createTenants } from './server.ts';

/** Operational limits. Not per-tenant config because the brief doesn't define them there; see README. */
const MAX_BODY_BYTES = 1024 * 1024;
const DELIVERY_TIMEOUT_MS = 10_000;
const TENANT_CONCURRENCY = 10;
const TENANT_MAX_BACKLOG = 10_000;

async function main(): Promise<void> {
  const port = Number(process.env.PORT);
  const tenantsFile = process.env.TENANTS_FILE;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError('PORT must be a valid port number');
  if (!tenantsFile) throw new ConfigError('TENANTS_FILE must be set');

  const configs = await loadTenants(tenantsFile);
  const tenants = createTenants(configs, {
    limits: { concurrency: TENANT_CONCURRENCY, maxBacklog: TENANT_MAX_BACKLOG },
    send: createHttpSender(DELIVERY_TIMEOUT_MS),
    clock: systemClock,
    log,
  });
  const server = createRelayServer({ tenants, log, maxBodyBytes: MAX_BODY_BYTES });

  server.listen(port, () => {
    log('info', 'relay listening', { port, tenants: [...configs.keys()] });
  });

  const shutdown = (signal: string) => {
    const undelivered = [...tenants.values()].reduce((n, t) => n + t.delivery.backlog, 0);
    // State is in memory only, so anything still in the backlog is lost. Say so loudly.
    log(undelivered > 0 ? 'error' : 'info', 'shutting down', { signal, undelivered });
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  log('error', 'failed to start', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
