'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController, NORMAL, VIP } = require('../src/orderController');
const { timestamp } = require('../src/format');
const { execute } = require('../src/cli');

const MS = 10000;
const setup = () => {
  test.mock.timers.enable({ apis: ['setTimeout'] });
  const events = [];
  return { c: new OrderController({ processingMs: MS, onEvent: (m) => events.push(m) }), events };
};
const ids = (orders) => orders.map((o) => o.id);

test.afterEach(() => test.mock.timers.reset());

test('normal order lands in PENDING', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  assert.deepStrictEqual(ids(c.status().pending), [1]);
});

test('order numbers are unique and increasing', () => {
  const { c } = setup();
  const got = [c.addOrder(NORMAL), c.addOrder(VIP), c.addOrder(NORMAL)].map((o) => o.id);
  assert.deepStrictEqual(got, [1, 2, 3]);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  const { c } = setup();
  c.addOrder(NORMAL); // 1
  c.addOrder(VIP);    // 2
  c.addOrder(NORMAL); // 3
  c.addOrder(VIP);    // 4
  assert.deepStrictEqual(ids(c.status().pending), [2, 4, 1, 3]);
});

test('new bot immediately picks up the head of PENDING', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  c.addOrder(VIP);
  c.addBot();
  assert.deepStrictEqual(ids(c.status().processing), [2]);
  assert.deepStrictEqual(ids(c.status().pending), [1]);
});

test('order completes after 10s, not before', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  c.addBot();
  test.mock.timers.tick(MS - 1);
  assert.strictEqual(c.status().complete.length, 0);
  test.mock.timers.tick(1);
  assert.deepStrictEqual(ids(c.status().complete), [1]);
});

test('bot moves on to next order, then goes IDLE', () => {
  const { c, events } = setup();
  c.addOrder(NORMAL);
  c.addOrder(NORMAL);
  c.addBot();
  test.mock.timers.tick(MS);
  assert.deepStrictEqual(ids(c.status().processing), [2]);
  test.mock.timers.tick(MS);
  assert.deepStrictEqual(ids(c.status().complete), [1, 2]);
  assert.strictEqual(c.status().bots[0].state, 'IDLE');
  assert.match(events.at(-1), /Bot #1 is now IDLE/);
});

test('idle bot picks up a new order immediately', () => {
  const { c } = setup();
  c.addBot();
  c.addOrder(VIP);
  assert.deepStrictEqual(ids(c.status().processing), [1]);
});

test('a bot handles only one order at a time', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  c.addOrder(NORMAL);
  c.addBot();
  assert.strictEqual(c.status().processing.length, 1);
});

test('multiple bots process in parallel', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  c.addOrder(NORMAL);
  c.addBot();
  c.addBot();
  assert.strictEqual(c.status().processing.length, 2);
  test.mock.timers.tick(MS);
  assert.strictEqual(c.status().complete.length, 2);
});

test('removing the bot returns its order to original position and stops processing', () => {
  const { c } = setup();
  c.addOrder(NORMAL); // 1
  c.addOrder(VIP);    // 2
  c.addBot();         // takes 2
  c.addOrder(VIP);    // 3
  c.addOrder(NORMAL); // 4
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [2, 3, 1, 4]);
  assert.strictEqual(c.status().bots.length, 0);
  test.mock.timers.tick(MS * 2); // stale timer must not complete anything
  assert.strictEqual(c.status().complete.length, 0);
});

test('removing a normal-order bot keeps it behind VIPs', () => {
  const { c } = setup();
  c.addOrder(NORMAL); // 1
  c.addBot();         // takes 1
  c.addOrder(VIP);    // 2
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [2, 1]);
});

test('removeBot destroys the newest bot only', () => {
  const { c } = setup();
  c.addBot();
  c.addBot();
  assert.strictEqual(c.removeBot().id, 2);
  assert.deepStrictEqual(c.status().bots.map((b) => b.id), [1]);
});

test('removeBot with no bots is a no-op', () => {
  const { c } = setup();
  assert.strictEqual(c.removeBot(), null);
});

test('removed order is picked up again by another bot', () => {
  const { c } = setup();
  c.addOrder(NORMAL);
  c.addBot();
  c.addBot();
  c.removeBot(); // bot 2 was idle
  c.removeBot(); // bot 1 busy -> order returns
  c.addBot();
  assert.deepStrictEqual(ids(c.status().processing), [1]);
});

test('timestamp is HH:MM:SS', () => {
  assert.match(timestamp(new Date(2020, 0, 1, 3, 4, 5)), /^03:04:05$/);
});

test('cli commands drive the controller', () => {
  const { c } = setup();
  const out = [];
  const print = (t) => out.push(t);
  execute(c, 'normal', print);
  execute(c, ' VIP ', print);
  execute(c, '+bot', print);
  execute(c, 'status', print);
  execute(c, 'nonsense', print);
  execute(c, '-bot', print);
  execute(c, '-bot', print);
  assert.match(out[0], /PROCESSING : #2\(VIP\) by bot #1/);
  assert.match(out[1], /Unknown command/);
  assert.strictEqual(out[2], 'No bots to remove');
  assert.strictEqual(execute(c, 'quit', print), false);
});
