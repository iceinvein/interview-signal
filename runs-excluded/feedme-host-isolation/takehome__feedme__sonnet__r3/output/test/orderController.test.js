'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType } = require('../src/orderController');
const { execute, timestamp } = require('../src/cli');

const ids = (list) => list.map((o) => o.id);

describe('OrderController', () => {
  let controller;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    controller = new OrderController();
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  it('adds a normal order to PENDING', () => {
    controller.addOrder(OrderType.NORMAL);
    assert.deepEqual(controller.status().pending, [{ id: 1, type: 'Normal' }]);
  });

  it('assigns unique, increasing order numbers', () => {
    const created = [OrderType.NORMAL, OrderType.VIP, OrderType.NORMAL].map((t) => controller.addOrder(t));
    assert.deepEqual(ids(created), [1, 2, 3]);
  });

  it('places VIP ahead of Normal but behind existing VIP', () => {
    controller.addOrder(OrderType.NORMAL); // 1
    controller.addOrder(OrderType.VIP); // 2
    controller.addOrder(OrderType.NORMAL); // 3
    controller.addOrder(OrderType.VIP); // 4
    assert.deepEqual(ids(controller.status().pending), [2, 4, 1, 3]);
  });

  it('bot completes an order after 10 seconds and moves it to COMPLETE', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    assert.equal(controller.status().pending.length, 0);

    mock.timers.tick(9_999);
    assert.equal(controller.status().complete.length, 0);
    mock.timers.tick(1);
    assert.deepEqual(ids(controller.status().complete), [1]);
  });

  it('bot picks up the next pending order after finishing', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    mock.timers.tick(10_000);
    assert.deepEqual(controller.status().bots, [{ id: 1, order: 2 }]);
    mock.timers.tick(10_000);
    assert.deepEqual(ids(controller.status().complete), [1, 2]);
  });

  it('bot becomes IDLE with no orders and picks up a new order immediately', () => {
    controller.addBot();
    assert.deepEqual(controller.status().bots, [{ id: 1, order: null }]);
    controller.addOrder(OrderType.VIP);
    assert.deepEqual(controller.status().bots, [{ id: 1, order: 1 }]);
  });

  it('a new bot immediately processes existing pending orders, one order per bot', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addOrder(OrderType.NORMAL);
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    controller.addBot();
    assert.deepEqual(controller.status().bots, [{ id: 1, order: 1 }, { id: 2, order: 2 }]);
    assert.deepEqual(ids(controller.status().pending), [3]);
  });

  it('removing a bot destroys the newest one and returns its order to its original position', () => {
    controller.addOrder(OrderType.VIP); // 1
    controller.addOrder(OrderType.VIP); // 2
    controller.addOrder(OrderType.NORMAL); // 3
    controller.addBot(); // takes 1
    controller.addBot(); // takes 2
    controller.addOrder(OrderType.VIP); // 4 pending

    controller.removeBot();
    assert.deepEqual(controller.status().bots, [{ id: 1, order: 1 }]);
    assert.deepEqual(ids(controller.status().pending), [2, 4, 3]);
  });

  it('a removed bot never completes its order', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    controller.removeBot();
    mock.timers.tick(20_000);
    assert.deepEqual(controller.status().complete, []);
    assert.deepEqual(ids(controller.status().pending), [1]);
  });

  it('the returned order is picked up by the next bot', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    controller.removeBot();
    controller.addBot();
    assert.deepEqual(controller.status().bots, [{ id: 2, order: 1 }]);
  });

  it('removing a bot when none exist is a no-op', () => {
    assert.equal(controller.removeBot(), null);
  });

  it('logs events', () => {
    const messages = [];
    const logged = new OrderController({ log: (m) => messages.push(m) });
    logged.addOrder(OrderType.VIP);
    logged.addBot();
    logged.shutdown();
    assert.deepEqual(messages, [
      'Created VIP Order #1 - Status: PENDING',
      'Bot #1 created - Status: ACTIVE',
      'Bot #1 picked up VIP Order #1 - Status: PROCESSING',
    ]);
  });
});

describe('CLI', () => {
  it('formats timestamps as HH:MM:SS', () => {
    assert.match(timestamp(), /^\d{2}:\d{2}:\d{2}$/);
  });

  it('executes commands', () => {
    const controller = new OrderController();
    execute(controller, 'vip');
    execute(controller, 'normal');
    assert.deepEqual(controller.status().pending.map((o) => o.type), ['VIP', 'Normal']);
    assert.match(execute(controller, 'status').output, /PENDING:\s+\[VIP#1, Normal#2\]/);
    assert.equal(execute(controller, '-bot').output, 'No bots to remove');
    assert.match(execute(controller, 'bogus').output, /Unknown command/);
    assert.equal(execute(controller, 'quit').quit, true);
  });
});
