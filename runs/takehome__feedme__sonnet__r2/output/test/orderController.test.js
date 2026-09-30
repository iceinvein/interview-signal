'use strict';

const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { OrderController, NORMAL, VIP } = require('../src/orderController');

let c;
const ids = (list) => list.map((o) => o.id);

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  c = new OrderController();
});
afterEach(() => {
  c.shutdown();
  mock.timers.reset();
});

test('new normal order goes to PENDING', () => {
  c.addOrder(NORMAL);
  assert.deepStrictEqual(c.status().pending, [{ id: 1, type: NORMAL }]);
});

test('order numbers are unique and increasing', () => {
  const nums = [c.addOrder(NORMAL), c.addOrder(VIP), c.addOrder(NORMAL)].map((o) => o.id);
  assert.deepStrictEqual(nums, [1, 2, 3]);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  c.addOrder(NORMAL); // 1
  c.addOrder(VIP);    // 2
  c.addOrder(NORMAL); // 3
  c.addOrder(VIP);    // 4
  assert.deepStrictEqual(ids(c.status().pending), [2, 4, 1, 3]);
});

test('bot completes an order after 10 seconds and moves it to COMPLETE', () => {
  c.addOrder(NORMAL);
  c.addBot();
  assert.strictEqual(c.status().pending.length, 0);
  assert.strictEqual(c.status().processing.length, 1);
  mock.timers.tick(9999);
  assert.strictEqual(c.status().complete.length, 0);
  mock.timers.tick(1);
  assert.deepStrictEqual(ids(c.status().complete), [1]);
});

test('bot picks up next pending order after finishing', () => {
  c.addOrder(NORMAL);
  c.addOrder(NORMAL);
  c.addBot();
  mock.timers.tick(10000);
  assert.deepStrictEqual(ids(c.status().processing), [2]);
  mock.timers.tick(10000);
  assert.deepStrictEqual(ids(c.status().complete), [1, 2]);
});

test('bot becomes IDLE without orders and picks up a new order immediately', () => {
  c.addBot();
  assert.strictEqual(c.status().bots[0].state, 'IDLE');
  c.addOrder(VIP);
  assert.strictEqual(c.status().bots[0].state, 'PROCESSING');
});

test('adding a bot immediately processes pending orders', () => {
  c.addOrder(NORMAL);
  c.addOrder(NORMAL);
  c.addBot();
  c.addBot();
  assert.strictEqual(c.status().pending.length, 0);
  assert.strictEqual(c.status().processing.length, 2);
});

test('removing a bot destroys the newest one', () => {
  c.addBot();
  c.addBot();
  assert.strictEqual(c.removeBot().id, 2);
  assert.deepStrictEqual(c.status().bots.map((b) => b.id), [1]);
});

test('removing a bot returns its order to its original position and stops processing', () => {
  c.addOrder(NORMAL); // 1
  c.addOrder(VIP);    // 2
  c.addOrder(NORMAL); // 3
  c.addBot();         // takes 2
  c.addBot();         // takes 1
  c.addOrder(VIP);    // 4 pending
  c.removeBot();      // bot 2 had order 1 -> back before 3, behind VIP 4
  assert.deepStrictEqual(ids(c.status().pending), [4, 1, 3]);
  mock.timers.tick(10000);
  assert.deepStrictEqual(ids(c.status().complete), [2]); // order 1 was not completed by removed bot
});

test('removing a VIP-processing bot puts the VIP order ahead of normal orders', () => {
  c.addOrder(VIP);    // 1
  c.addBot();
  c.addOrder(NORMAL); // 2
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [1, 2]);
});

test('removing with no bots is a no-op', () => {
  assert.strictEqual(c.removeBot(), null);
});

test('events are reported', () => {
  const events = [];
  c = new OrderController({ onEvent: (m) => events.push(m) });
  c.addOrder(VIP);
  c.addBot();
  mock.timers.tick(10000);
  assert.ok(events.some((e) => e.includes('completed VIP Order #1')));
});
