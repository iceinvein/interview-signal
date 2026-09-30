import { loadTenants } from './config.js';
import { createRelay } from './relay.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORT);
  const file = process.env.TENANTS_FILE;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !file) {
    throw new Error('Set PORT to a TCP port (1-65535) and TENANTS_FILE to a JSON file path');
  }
  const tenants = await loadTenants(file);
  createRelay(tenants).listen(port, () => {
    process.stderr.write(`Webhook relay listening on port ${port}\n`);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
