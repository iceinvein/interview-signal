import { loadTenants } from './config.js';
import { createWebhookServer } from './server.js';

const tenantFile = process.env.TENANTS_FILE;
const portText = process.env.PORT;
const port = Number(portText);

if (!tenantFile) throw new Error('TENANTS_FILE is required');
if (!portText || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const tenants = loadTenants(tenantFile);
createWebhookServer(tenants).listen(port, () => {
  console.log(JSON.stringify({ type: 'listening', port, tenants: tenants.size }));
});
