import { loadTenants } from './config.js';
import { createRelay } from './relay.js';

async function main(): Promise<void> {
  const file = process.env.TENANTS_FILE;
  const port = Number(process.env.PORT);
  if (!file) throw new Error('TENANTS_FILE is required');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  const tenants = await loadTenants(file);
  const server = createRelay(tenants);
  server.listen(port, () => {
    const address = server.address();
    console.error(`webhook relay listening on port ${typeof address === 'object' && address !== null ? address.port : port}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
