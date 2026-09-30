'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType, OrderStatus, BotStatus } = require('../src/orderController');
const { formatTime, createLogger } = require('../src/logger');

const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  let logs;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    logs = [];
    controller = new OrderController({ log: (msg) => logs.push(msg) });
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('puts a new normal order in PENDING', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      assert.equal(order.status, OrderStatus.PENDING);
      assert.deepEqual(ids(controller.pending), [order.id]);
    });

    it('assigns unique, increasing order numbers', () => {
      const a = controller.addOrder(OrderType.NORMAL);
      const b = controller.addOrder(OrderType.VIP);
      const c = controller.addOrder(OrderType.NORMAL);
      assert.ok(a.id < b.id && b.id < c.id);
    });

    it('places VIP orders behind existing VIP orders but ahead of normal orders', () => {
      const n1 = controller.addOrder(OrderType.NORMAL);
      const v1 = controller.addOrder(OrderType.VIP);
      const n2 = controller.addOrder(OrderType.NORMAL);
      const v2 = controller.addOrder(OrderType.VIP);
      assert.deepEqual(ids(controller.pending), [v1.id, v2.id, n1.id, n2.id]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('immediately picks up a pending order when added', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      const bot = controller.addBot();
      assert.equal(bot.status, BotStatus.PROCESSING);
      assert.equal(bot.order, order);
      assert.equal(order.status, OrderStatus.PROCESSING);
      assert.equal(controller.pending.length, 0);
    });

    it('completes an order after 10 seconds, not before', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      mock.timers.tick(9_999);
      assert.equal(order.status, OrderStatus.PROCESSING);
      mock.timers.tick(1);
      assert.equal(order.status, OrderStatus.COMPLETE);
      assert.deepEqual(ids(controller.complete), [order.id]);
    });

    it('processes one order at a time and then takes the next one', () => {
      const a = controller.addOrder(OrderType.NORMAL);
      const b = controller.addOrder(OrderType.NORMAL);
      const bot = controller.addBot();
      assert.equal(bot.order, a);
      assert.equal(b.status, OrderStatus.PENDING);
      mock.timers.tick(10_000);
      assert.equal(bot.order, b);
      mock.timers.tick(10_000);
      assert.deepEqual(ids(controller.complete), [a.id, b.id]);
    });

    it('processes VIP orders first', () => {
      const n = controller.addOrder(OrderType.NORMAL);
      const v = controller.addOrder(OrderType.VIP);
      controller.addBot();
      mock.timers.tick(10_000);
      mock.timers.tick(10_000);
      assert.deepEqual(ids(controller.complete), [v.id, n.id]);
    });

    it('becomes IDLE when there are no pending orders', () => {
      const bot = controller.addBot();
      assert.equal(bot.status, BotStatus.IDLE);
      controller.addOrder(OrderType.NORMAL);
      mock.timers.tick(10_000);
      assert.equal(bot.status, BotStatus.IDLE);
      assert.ok(logs.at(-1).includes('IDLE'));
    });

    it('wakes an IDLE bot when a new order comes in', () => {
      const bot = controller.addBot();
      const order = controller.addOrder(OrderType.VIP);
      assert.equal(bot.order, order);
    });

    it('lets multiple bots work in parallel', () => {
      const a = controller.addOrder(OrderType.NORMAL);
      const b = controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      controller.addBot();
      mock.timers.tick(10_000);
      assert.deepEqual(ids(controller.complete), [a.id, b.id]);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      const newest = controller.addBot();
      assert.equal(controller.removeBot(), newest);
      assert.deepEqual(controller.bots.map((b) => b.id), [1]);
    });

    it('returns the in-progress order to its original position in PENDING', () => {
      const v1 = controller.addOrder(OrderType.VIP);
      const v2 = controller.addOrder(OrderType.VIP);
      const n1 = controller.addOrder(OrderType.NORMAL);
      controller.addBot(); // takes v1
      controller.addBot(); // takes v2
      const v3 = controller.addOrder(OrderType.VIP);
      controller.removeBot();
      assert.equal(v2.status, OrderStatus.PENDING);
      assert.deepEqual(ids(controller.pending), [v2.id, v3.id, n1.id]);
      assert.equal(v1.status, OrderStatus.PROCESSING);
    });

    it('stops the process so the order is never completed by the removed bot', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      mock.timers.tick(5_000);
      controller.removeBot();
      mock.timers.tick(10_000);
      assert.equal(order.status, OrderStatus.PENDING);
      assert.equal(controller.complete.length, 0);
    });

    it('restarts the full 10 seconds when a new bot picks up a returned order', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      mock.timers.tick(5_000);
      controller.removeBot();
      controller.addBot();
      mock.timers.tick(9_999);
      assert.equal(order.status, OrderStatus.PROCESSING);
      mock.timers.tick(1);
      assert.equal(order.status, OrderStatus.COMPLETE);
    });

    it('does nothing when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
      assert.equal(logs.at(-1), 'No bot to remove');
    });
  });

  it('reports status of all areas', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addOrder(OrderType.NORMAL);
    controller.addBot();
    mock.timers.tick(10_000);
    assert.deepEqual(controller.status(), {
      pending: [],
      complete: ['Normal Order #1001'],
      bots: ['Bot #1: PROCESSING #1002'],
    });
  });
});

describe('logger', () => {
  it('formats time as HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2026, 0, 1, 9, 5, 3)), '09:05:03');
  });

  it('prefixes messages with a timestamp', () => {
    const lines = [];
    createLogger((line) => lines.push(line))('hello');
    assert.match(lines[0], /^\[\d{2}:\d{2}:\d{2}\] hello$/);
  });
});
