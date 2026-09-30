'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController } = require('../src/orderController');

const MS = 50;
const make = () => new OrderController({ processingMs: MS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (orders) => orders.map((o) => o.id);

test('normal order goes to PENDING with unique increasing ids', () => {
  const c = make();
  const a = c.addNormalOrder();
  const b = c.addVipOrder();
  assert.ok(b.id > a.id);
  assert.strictEqual(c.status().pending.length, 2);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  const c = make();
  c.addNormalOrder(); // 1
  c.addVipOrder();    // 2
  c.addNormalOrder(); // 3
  c.addVipOrder();    // 4
  assert.deepStrictEqual(ids(c.status().pending), [2, 4, 1, 3]);
});

test('bot processes an order then moves it to COMPLETE and goes IDLE', async () => {
  const c = make();
  c.addNormalOrder();
  c.addBot();
  assert.strictEqual(c.status().bots[0].state, 'PROCESSING');
  await sleep(MS * 2);
  const s = c.status();
  assert.deepStrictEqual(ids(s.complete), [1]);
  assert.strictEqual(s.bots[0].state, 'IDLE');
  c.shutdown();
});

test('bot takes a new order immediately when idle', () => {
  const c = make();
  c.addBot();
  c.addNormalOrder();
  assert.strictEqual(c.status().bots[0].orderId, 1);
  c.shutdown();
});

test('bot picks up the next pending order after finishing, VIP first', async () => {
  const c = make();
  c.addNormalOrder();
  c.addNormalOrder();
  c.addVipOrder();
  c.addBot();
  await sleep(MS * 3.5);
  assert.deepStrictEqual(ids(c.status().complete), [3, 1, 2]);
  c.shutdown();
});

test('each bot handles only one order at a time', () => {
  const c = make();
  c.addNormalOrder();
  c.addNormalOrder();
  c.addBot();
  assert.strictEqual(c.status().pending.length, 1);
  c.shutdown();
});

test('removing a bot returns its order to original position and stops processing', async () => {
  const c = make();
  c.addNormalOrder(); // 1
  c.addNormalOrder(); // 2
  c.addBot();         // takes 1
  c.addVipOrder();    // 3 pending
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [3, 1, 2]);
  await sleep(MS * 2);
  assert.strictEqual(c.status().complete.length, 0);
});

test('returned VIP order stays behind earlier VIP, ahead of normal', () => {
  const c = make();
  c.addVipOrder();    // 1
  c.addBot();         // takes 1
  c.addVipOrder();    // 2
  c.addNormalOrder(); // 3
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [1, 2, 3]);
});

test('removeBot destroys the newest bot and tolerates no bots', () => {
  const c = make();
  assert.strictEqual(c.removeBot(), null);
  c.addBot();
  c.addBot();
  assert.strictEqual(c.removeBot().id, 2);
  assert.strictEqual(c.status().bots.length, 1);
});

test('newly added bot immediately processes pending orders', () => {
  const c = make();
  c.addVipOrder();
  c.addBot();
  assert.strictEqual(c.status().pending.length, 0);
  c.shutdown();
});
