'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController } = require('../src/orderController');
const { handleCommand, timestamp } = require('../src/cli');

test('timestamp is HH:MM:SS', () => {
  assert.match(timestamp(new Date(2020, 0, 1, 3, 4, 5)), /^03:04:05$/);
});

test('commands drive the controller and quit returns false', () => {
  const c = new OrderController({ processingMs: 10 });
  const out = [];
  const write = (l) => out.push(l);
  assert.ok(handleCommand(c, 'n', write));
  assert.ok(handleCommand(c, 'vip', write));
  assert.strictEqual(c.status().pending[0].type, 'VIP');
  handleCommand(c, 'status', write);
  assert.match(out.at(-1), /PENDING:  V2, N1/);
  handleCommand(c, 'bogus', write);
  assert.match(out.at(-1), /Unknown command/);
  assert.strictEqual(handleCommand(c, 'q', write), false);
});
