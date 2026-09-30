import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import { once } from 'node:events';
import { Relay, fetchDelivery } from '../src/relay.js';
import { createRelayServer } from '../src/server.js';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  return address.port;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('HTTP relay preserves opaque bytes, Content-Type and ID; logs every incoming body', async () => {
  const received: Array<{ body: Buffer; contentType?: string; id?: string }> = [];
  const destination = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push({ body: Buffer.concat(chunks), contentType: request.headers['content-type'], id: request.headers['x-webhook-id'] as string | undefined });
    response.writeHead(204).end();
  });
  const destinationPort = await listen(destination);
  const records: Record<string, unknown>[] = [];
  const log = (record: Record<string, unknown>) => { records.push(record); };
  const relay = new Relay({ acme: { destination: `http://127.0.0.1:${destinationPort}/`, maxAttempts: 1, initialBackoffMs: 10, requestsPerSecond: 1 } }, fetchDelivery, log);
  const server = createRelayServer(relay, log);
  const port = await listen(server);
  try {
    const body = Buffer.from([0, 1, 254, 255]);
    const accepted = await fetch(`http://127.0.0.1:${port}/webhooks/acme`, { method: 'POST', headers: { 'Content-Type': 'application/x-custom' }, body });
    assert.equal(accepted.status, 202);
    const id = accepted.headers.get('x-webhook-id');
    assert.ok(id);
    const limited = await fetch(`http://127.0.0.1:${port}/webhooks/acme`, { method: 'POST', body: 'excess' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '1');
    const unknown = await fetch(`http://127.0.0.1:${port}/webhooks/unknown`, { method: 'POST', body: 'unknown body' });
    assert.equal(unknown.status, 404);
    for (let i = 0; i < 20 && received.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(received.length, 1);
    assert.deepEqual(received[0]!.body, body);
    assert.equal(received[0]!.contentType, 'application/x-custom');
    assert.equal(received[0]!.id, id);
    const incoming = records.filter(record => record.type === 'incoming');
    assert.equal(incoming.length, 3);
    assert.equal(incoming[0]!.webhookId, id);
    assert.deepEqual(incoming.map(record => record.status), [202, 429, 404]);
    assert.deepEqual(incoming.map(record => Buffer.from(record.bodyBase64 as string, 'base64')), [body, Buffer.from('excess'), Buffer.from('unknown body')]);
  } finally {
    await close(server);
    await close(destination);
  }
});

test('202 does not wait for destination response', async () => {
  let finish!: () => void;
  const destination = createServer((_request, response) => { finish = () => response.writeHead(200).end(); });
  const destinationPort = await listen(destination);
  const relay = new Relay({ acme: { destination: `http://127.0.0.1:${destinationPort}/`, maxAttempts: 1, initialBackoffMs: 1, requestsPerSecond: 1 } }, fetchDelivery, () => {});
  const server = createRelayServer(relay, () => {});
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/acme`, { method: 'POST', body: 'hello' });
    assert.equal(response.status, 202);
    for (let i = 0; i < 20 && !finish; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(finish);
    finish();
  } finally {
    await close(server);
    await close(destination);
  }
});

test('outbound HTTP does not follow redirects', async () => {
  let redirected = false;
  const destination = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/target' }).end();
    } else {
      redirected = true;
      response.writeHead(200).end();
    }
  });
  const port = await listen(destination);
  try {
    const status = await fetchDelivery(`http://127.0.0.1:${port}/redirect`, { id: 'stable-id', body: Buffer.alloc(0) });
    assert.equal(status, 302);
    assert.equal(redirected, false);
  } finally {
    await close(destination);
  }
});
