'use strict';

const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType } = require('../src/orderController');
const { timestamp } = require('../src/cli');

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

test('normal order appears in PENDING with unique increasing numbers', () => {
  const a = c.addOrder(OrderType.NORMAL);
  const b = c.addOrder(OrderType.VIP);
  assert.ok(b.id > a.id);
  assert.equal(c.status().pending.length, 2);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  c.addOrder(OrderType.NORMAL); // 1
  c.addOrder(OrderType.VIP); // 2
  c.addOrder(OrderType.NORMAL); // 3
  c.addOrder(OrderType.VIP); // 4
  assert.deepEqual(ids(c.status().pending), [2, 4, 1, 3]);
});

test('bot completes an order after 10s and moves it to COMPLETE', () => {
  c.addOrder(OrderType.NORMAL);
  c.addBot();
  assert.equal(c.status().pending.length, 0);
  mock.timers.tick(9_999);
  assert.equal(c.status().complete.length, 0);
  mock.timers.tick(1);
  assert.deepEqual(ids(c.status().complete), [1]);
});

test('bot picks next pending order, then goes idle', () => {
  c.addOrder(OrderType.NORMAL);
  c.addOrder(OrderType.NORMAL);
  c.addBot();
  mock.timers.tick(10_000);
  assert.equal(c.status().bots[0].order, 2);
  mock.timers.tick(10_000);
  assert.deepEqual(ids(c.status().complete), [1, 2]);
  assert.equal(c.status().bots[0].order, null);
});

test('idle bot immediately takes a new order', () => {
  c.addBot();
  c.addOrder(OrderType.VIP);
  assert.equal(c.status().bots[0].order, 1);
});

test('new bot immediately processes pending orders', () => {
  c.addOrder(OrderType.NORMAL);
  c.addOrder(OrderType.NORMAL);
  c.addBot();
  c.addBot();
  assert.deepEqual(c.status().bots.map((b) => b.order), [1, 2]);
});

test('removing newest bot returns its order to original position and stops it', () => {
  c.addOrder(OrderType.NORMAL); // 1
  c.addOrder(OrderType.NORMAL); // 2
  c.addBot(); // takes 1
  c.addBot(); // takes 2
  c.addOrder(OrderType.NORMAL); // 3
  c.addOrder(OrderType.VIP); // 4
  c.removeBot(); // bot 2 dropped, order 2 back
  assert.deepEqual(ids(c.status().pending), [4, 2, 3]);
  assert.equal(c.status().bots.length, 1);
  mock.timers.tick(10_000); // only bot 1 finishes order 1
  assert.deepEqual(ids(c.status().complete), [1]);
  assert.equal(c.status().bots[0].order, 4);
});

test('removed bot does not complete its order', () => {
  c.addOrder(OrderType.NORMAL);
  c.addBot();
  c.removeBot();
  mock.timers.tick(20_000);
  assert.equal(c.status().complete.length, 0);
  assert.deepEqual(ids(c.status().pending), [1]);
});

test('removing a bot when none exist is a safe no-op', () => {
  assert.equal(c.removeBot(), null);
});

test('timestamp is HH:MM:SS', () => {
  assert.match(timestamp(), /^\d{2}:\d{2}:\d{2}$/);
});
