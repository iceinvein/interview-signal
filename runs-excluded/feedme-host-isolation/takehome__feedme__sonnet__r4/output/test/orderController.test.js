'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, TYPE } = require('../src/orderController');

let controller;
let events;

beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  events = [];
  controller = new OrderController({ onEvent: (e) => events.push(e.type) });
});
afterEach(() => controller.shutdown());

const pendingIds = () => controller.snapshot().pending.map((o) => o.id);
const completeIds = () => controller.snapshot().complete.map((o) => o.id);

test('new normal order shows up in PENDING', () => {
  controller.addOrder(TYPE.NORMAL);
  assert.deepEqual(pendingIds(), [1]);
});

test('order numbers are unique and increasing', () => {
  const ids = [TYPE.NORMAL, TYPE.VIP, TYPE.NORMAL].map((t) => controller.addOrder(t).id);
  assert.deepEqual(ids, [1, 2, 3]);
});

test('VIP goes ahead of normal orders but behind existing VIP orders', () => {
  controller.addOrder(TYPE.NORMAL); // 1
  controller.addOrder(TYPE.VIP);    // 2
  controller.addOrder(TYPE.NORMAL); // 3
  controller.addOrder(TYPE.VIP);    // 4
  assert.deepEqual(pendingIds(), [2, 4, 1, 3]);
});

test('rejects unknown order types', () => {
  assert.throws(() => controller.addOrder('GOLD'), /Unknown order type/);
});

test('new bot immediately picks up a pending order', () => {
  controller.addOrder();
  controller.addBot();
  assert.deepEqual(pendingIds(), []);
  assert.equal(controller.snapshot().processing.length, 1);
});

test('order moves to COMPLETE after 10 seconds, not before', (t) => {
  controller.addOrder();
  controller.addBot();
  t.mock.timers.tick(9_999);
  assert.deepEqual(completeIds(), []);
  t.mock.timers.tick(1);
  assert.deepEqual(completeIds(), [1]);
});

test('bot proceeds to the next pending order after finishing', (t) => {
  controller.addOrder();
  controller.addOrder();
  controller.addBot();
  t.mock.timers.tick(10_000);
  assert.deepEqual(completeIds(), [1]);
  assert.equal(controller.snapshot().processing[0].order.id, 2);
  t.mock.timers.tick(10_000);
  assert.deepEqual(completeIds(), [1, 2]);
});

test('bot becomes IDLE when nothing is pending and resumes when an order arrives', (t) => {
  controller.addBot();
  assert.equal(controller.snapshot().bots[0].status, 'IDLE');
  controller.addOrder();
  assert.equal(controller.snapshot().bots[0].status, 'BUSY');
  t.mock.timers.tick(10_000);
  assert.equal(controller.snapshot().bots[0].status, 'IDLE');
});

test('a bot handles only one order at a time', () => {
  controller.addOrder();
  controller.addOrder();
  controller.addBot();
  assert.equal(controller.snapshot().processing.length, 1);
  assert.deepEqual(pendingIds(), [2]);
});

test('multiple bots process orders in parallel', (t) => {
  controller.addOrder();
  controller.addOrder();
  controller.addBot();
  controller.addBot();
  t.mock.timers.tick(10_000);
  assert.deepEqual(completeIds(), [1, 2]);
});

test('removing a bot destroys the newest one', () => {
  controller.addBot();
  controller.addBot();
  assert.equal(controller.removeBot().id, 2);
  assert.deepEqual(controller.snapshot().bots.map((b) => b.id), [1]);
});

test('removing a busy bot returns its order to the original position', (t) => {
  controller.addOrder(TYPE.NORMAL); // 1
  controller.addBot();              // bot takes 1
  controller.addOrder(TYPE.NORMAL); // 2
  controller.addOrder(TYPE.VIP);    // 3
  controller.removeBot();
  assert.deepEqual(pendingIds(), [3, 1, 2]);
  t.mock.timers.tick(20_000);
  assert.deepEqual(completeIds(), []); // cancelled timer must not complete the order
});

test('a returned VIP order stays ahead of normal orders', () => {
  controller.addOrder(TYPE.VIP);    // 1
  controller.addBot();
  controller.addOrder(TYPE.NORMAL); // 2
  controller.removeBot();
  assert.deepEqual(pendingIds(), [1, 2]);
});

test('re-added bot restarts the returned order for a full 10 seconds', (t) => {
  controller.addOrder();
  controller.addBot();
  t.mock.timers.tick(6_000);
  controller.removeBot();
  controller.addBot();
  t.mock.timers.tick(9_999);
  assert.deepEqual(completeIds(), []);
  t.mock.timers.tick(1);
  assert.deepEqual(completeIds(), [1]);
});

test('removing a bot when none exist is a no-op', () => {
  assert.equal(controller.removeBot(), null);
});

test('emits events for state changes', () => {
  controller.addOrder();
  controller.addBot();
  assert.deepEqual(events, ['ORDER_ADDED', 'BOT_ADDED', 'ORDER_STARTED']);
});
