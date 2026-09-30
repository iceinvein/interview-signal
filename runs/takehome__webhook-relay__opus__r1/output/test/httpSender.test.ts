import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { createHttpSender } from '../src/httpSender.ts';

const servers: { close(): void; closeAllConnections(): void }[] = [];
after(() => servers.forEach((s) => (s.closeAllConnections(), s.close())));

interface Received {
  method?: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

async function destination(handler: (res: ServerResponse) => void) {
  const received: Received[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    received.push({ method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
    handler(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, received };
}

const req = (url: string, contentType: string | undefined = 'text/plain') => ({
  url,
  webhookId: 'evt-123',
  body: new Uint8Array(Buffer.from('hello')),
  contentType,
});

test('POSTs the body with Content-Type and X-Webhook-Id, and reports 2xx as delivered', async () => {
  const dest = await destination((res) => res.writeHead(204).end());
  const result = await createHttpSender(1000)(req(dest.url));
  assert.deepEqual(result, { ok: true, status: 204 });
  const [got] = dest.received;
  assert.equal(got!.method, 'POST');
  assert.equal(got!.headers['content-type'], 'text/plain');
  assert.equal(got!.headers['x-webhook-id'], 'evt-123');
  assert.equal(got!.body.toString(), 'hello');
});

test('sends no Content-Type when the original had none', async () => {
  const dest = await destination((res) => res.writeHead(200).end());
  await createHttpSender(1000)({ ...req(dest.url), contentType: undefined });
  assert.equal(dest.received[0]!.headers['content-type'], undefined);
});

test('treats non-2xx as failure and does not follow redirects', async (t) => {
  for (const status of [500, 404, 429, 302]) {
    await t.test(String(status), async () => {
      const dest = await destination((res) => res.writeHead(status, { location: '/elsewhere' }).end('nope'));
      assert.deepEqual(await createHttpSender(1000)(req(dest.url)), { ok: false, status });
      assert.equal(dest.received.length, 1);
    });
  }
});

test('treats connection errors as failure', async () => {
  // Grab a free port, then close it so nothing is listening there.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));

  const result = await createHttpSender(1000)(req(`http://127.0.0.1:${port}/hook`));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /ECONNREFUSED/);
});

test('treats a destination that never answers as failure after the timeout', async () => {
  const dest = await destination(() => {});
  const result = await createHttpSender(50)(req(dest.url));
  assert.deepEqual(result, { ok: false, error: 'timed out' });
});
