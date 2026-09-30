import { loadConfig } from './config.js';
import { Relay, fetchDelivery } from './relay.js';
import { createRelayServer } from './server.js';

const path = process.env.TENANTS_FILE;
if (!path) throw new Error('TENANTS_FILE is required');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid port number');

const log = (record: Record<string, unknown>): void => { process.stdout.write(JSON.stringify(record) + '\n'); };
const tenants = await loadConfig(path);
const relay = new Relay(tenants, fetchDelivery, log);
const server = createRelayServer(relay, log);
server.listen(port, () => log({ type: 'listening', port: (server.address() as { port: number }).port }));
