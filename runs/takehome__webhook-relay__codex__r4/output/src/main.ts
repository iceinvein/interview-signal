import { loadTenants } from './config';
import { createRelay } from './relay';

const tenantsFile = process.env.TENANTS_FILE;
const port = Number(process.env.PORT);
if (!tenantsFile || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('TENANTS_FILE and a valid PORT (1-65535) are required');
  process.exit(1);
}

try {
  const server = createRelay(loadTenants(tenantsFile));
  server.listen(port, () => console.log(JSON.stringify({ kind: 'startup', port })));
} catch (error) {
  console.error(`Cannot start relay: ${String(error)}`);
  process.exit(1);
}
