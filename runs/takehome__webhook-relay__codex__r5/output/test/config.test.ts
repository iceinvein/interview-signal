import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTenants } from '../src/config.js';

test('validates tenant configuration on startup', () => {
  const valid = { tenants: { acme: {
    destination: 'https://hooks.example/path', maxAttempts: 5,
    initialBackoffMs: 1000, requestsPerSecond: 20,
  } } };
  assert.equal(parseTenants(valid).get('acme')?.requestsPerSecond, 20);
  assert.throws(() => parseTenants({ tenants: { acme: { ...valid.tenants.acme, maxAttempts: 0 } } }), /maxAttempts/);
  assert.throws(() => parseTenants({ tenants: { acme: { ...valid.tenants.acme, destination: 'file:\/\/etc\/passwd' } } }), /destination/);
  assert.throws(() => parseTenants({ tenants: { acme: { ...valid.tenants.acme, requestsPerSecond: 0 } } }), /requestsPerSecond/);
});
