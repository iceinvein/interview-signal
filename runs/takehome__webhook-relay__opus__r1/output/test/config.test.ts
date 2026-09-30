import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, parseTenants } from '../src/config.ts';

const valid = {
  destination: 'https://hooks.acme.example/relay',
  maxAttempts: 5,
  initialBackoffMs: 1000,
  requestsPerSecond: 20,
};

test('parses the documented format', () => {
  const tenants = parseTenants(JSON.stringify({ tenants: { acme: valid } }));
  assert.deepEqual([...tenants], [['acme', valid]]);
});

test('rejects invalid configuration', async (t) => {
  const cases: [string, unknown][] = [
    ['not JSON', '{'],
    ['missing tenants', {}],
    ['non-http destination', { tenants: { a: { ...valid, destination: 'ftp://x' } } }],
    ['relative destination', { tenants: { a: { ...valid, destination: '/relay' } } }],
    ['zero maxAttempts', { tenants: { a: { ...valid, maxAttempts: 0 } } }],
    ['fractional maxAttempts', { tenants: { a: { ...valid, maxAttempts: 1.5 } } }],
    ['negative backoff', { tenants: { a: { ...valid, initialBackoffMs: -1 } } }],
    ['zero rate', { tenants: { a: { ...valid, requestsPerSecond: 0 } } }],
    ['string rate', { tenants: { a: { ...valid, requestsPerSecond: '20' } } }],
  ];
  for (const [name, doc] of cases) {
    await t.test(name, () => {
      const raw = typeof doc === 'string' ? doc : JSON.stringify(doc);
      assert.throws(() => parseTenants(raw), ConfigError);
    });
  }
});
