'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType } = require('../src/orderController');

const ids = (list) => list.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  beforeEach(() => {
    controller = new OrderController({ processingMs: 10_000 });
  });

  afterEach(() => {
    while (controller.removeBot()); // clear in-flight timers so the runner can exit
  });

  test('normal orders land in PENDING with unique increasing numbers', () => {
    const a = controller.addOrder(OrderType.NORMAL);
    const b = controller.addOrder(OrderType.NORMAL);
    assert.ok(b.id > a.id);
    assert.deepEqual(ids(controller.status().pending), [a.id, b.id]);
  });

  test('VIP goes ahead of Normal but behind existing VIP', () => {
    const n1 = controller.addOrder(OrderType.NORMAL);
    const v1 = controller.addOrder(OrderType.VIP);
    const n2 = controller.addOrder(OrderType.NORMAL);
    const v2 = controller.addOrder(OrderType.VIP);
    assert.deepEqual(ids(controller.status().pending), [v1.id, v2.id, n1.id, n2.id]);
  });

  test('adding a bot processes the first pending order for 10s, then completes it', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const n1 = controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    assert.equal(controller.status().bots[0].order, n1.id);
    t.mock.timers.tick(9_999);
    assert.equal(controller.status().complete.length, 0);
    t.mock.timers.tick(1);
    assert.deepEqual(ids(controller.status().complete), [n1.id]);
    assert.equal(controller.status().bots[0].state, 'IDLE');
  });

  test('bot picks up the next order after finishing one', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const n1 = controller.addOrder(OrderType.NORMAL);
    const n2 = controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    t.mock.timers.tick(10_000);
    assert.equal(controller.status().bots[0].order, n2.id);
    t.mock.timers.tick(10_000);
    assert.deepEqual(ids(controller.status().complete), [n1.id, n2.id]);
  });

  test('idle bot picks up a newly created order immediately', () => {
    controller.addBot();
    assert.equal(controller.status().bots[0].state, 'IDLE');
    const n = controller.addOrder(OrderType.NORMAL);
    assert.equal(controller.status().bots[0].order, n.id);
  });

  test('VIP created while bots are busy is processed before waiting Normals', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    controller.addOrder(OrderType.NORMAL);
    const n2 = controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    const v = controller.addOrder(OrderType.VIP);
    t.mock.timers.tick(10_000);
    assert.equal(controller.status().bots[0].order, v.id);
    assert.deepEqual(ids(controller.status().pending), [n2.id]);
  });

  test('removing the newest bot returns its order to its original position', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const v1 = controller.addOrder(OrderType.VIP);
    const n1 = controller.addOrder(OrderType.NORMAL);
    const n2 = controller.addOrder(OrderType.NORMAL);
    controller.addBot(); // takes v1
    controller.addBot(); // takes n1
    const removed = controller.removeBot();
    assert.equal(removed.id, 2);
    assert.deepEqual(ids(controller.status().pending), [n1.id, n2.id]);
    // interrupted work is discarded: the timer must not complete the order
    t.mock.timers.tick(10_000);
    assert.deepEqual(ids(controller.status().complete), [v1.id]);
    assert.equal(controller.status().bots.length, 1);
  });

  test('interrupted order goes ahead of newer orders of the same type', () => {
    const v1 = controller.addOrder(OrderType.VIP);
    controller.addBot();
    const v2 = controller.addOrder(OrderType.VIP);
    const n1 = controller.addOrder(OrderType.NORMAL);
    controller.removeBot();
    assert.deepEqual(ids(controller.status().pending), [v1.id, v2.id, n1.id]);
  });

  test('removing an idle bot leaves the other bot\'s work untouched', () => {
    controller.addBot();
    controller.addBot();
    const n = controller.addOrder(OrderType.NORMAL); // taken by bot 1
    controller.removeBot(); // idle bot 2
    assert.equal(controller.status().bots[0].order, n.id);
    assert.deepEqual(controller.status().pending, []);
  });

  test('removing a bot with none present is a no-op', () => {
    assert.equal(controller.removeBot(), null);
  });

  test('emits events for each state change', () => {
    const events = [];
    const c = new OrderController({ onEvent: (m) => events.push(m) });
    c.addOrder(OrderType.VIP);
    c.addBot();
    assert.match(events.join('\n'), /Created VIP Order #1 - Status: PENDING/);
    assert.match(events.join('\n'), /Bot #1 picked up VIP Order #1/);
    c.removeBot();
    assert.match(events.join('\n'), /returned to PENDING/);
  });
});
