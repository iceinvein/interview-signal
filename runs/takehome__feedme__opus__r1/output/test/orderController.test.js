'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType, OrderStatus } = require('../src/orderController');
const { formatTime } = require('../src/logger');

const PROCESSING_MS = 10_000;
const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    controller = new OrderController({ processingTimeMs: PROCESSING_MS });
  });

  afterEach(() => mock.timers.reset());

  describe('orders', () => {
    it('puts a new normal order into PENDING', () => {
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

    it('places VIP orders behind existing VIPs but ahead of all normal orders', () => {
      controller.addOrder(OrderType.NORMAL); // 1
      controller.addOrder(OrderType.VIP); //    2
      controller.addOrder(OrderType.NORMAL); // 3
      controller.addOrder(OrderType.VIP); //    4
      assert.deepEqual(ids(controller.pending), [2, 4, 1, 3]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('GOLD'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('a new bot immediately picks up the highest priority pending order', () => {
      controller.addOrder(OrderType.NORMAL);
      const vip = controller.addOrder(OrderType.VIP);
      const bot = controller.addBot();
      assert.equal(bot.order, vip);
      assert.equal(vip.status, OrderStatus.PROCESSING);
      assert.deepEqual(ids(controller.pending), [1]);
    });

    it('completes an order after exactly 10 seconds, then takes the next one', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addOrder(OrderType.NORMAL);
      const bot = controller.addBot();

      mock.timers.tick(PROCESSING_MS - 1);
      assert.equal(controller.completed.length, 0);

      mock.timers.tick(1);
      assert.deepEqual(ids(controller.completed), [1]);
      assert.equal(controller.completed[0].status, OrderStatus.COMPLETE);
      assert.equal(bot.order.id, 2);
    });

    it('processes only one order at a time per bot', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      assert.equal(controller.pending.length, 1);
    });

    it('becomes IDLE when nothing is pending and resumes on a new order', () => {
      const idle = mock.fn();
      controller.on('botIdle', idle);
      controller.addOrder(OrderType.NORMAL);
      const bot = controller.addBot();

      mock.timers.tick(PROCESSING_MS);
      assert.equal(bot.order, null);
      assert.equal(idle.mock.callCount(), 1);

      const next = controller.addOrder(OrderType.VIP);
      assert.equal(bot.order, next);
    });

    it('multiple bots process orders in parallel', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      controller.addBot();
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.completed), [1, 2]);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      const newest = controller.addBot();
      assert.equal(controller.removeBot(), newest);
      assert.deepEqual(controller.bots.map((b) => b.id), [1]);
    });

    it('returns null when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('stops processing and returns the order to its original position', () => {
      controller.addOrder(OrderType.VIP); //    1
      controller.addOrder(OrderType.NORMAL); // 2
      controller.addOrder(OrderType.NORMAL); // 3
      controller.addBot(); // takes 1
      controller.addBot(); // takes 2
      controller.addOrder(OrderType.VIP); //    4 -> pending [4, 3]

      controller.removeBot();
      assert.deepEqual(ids(controller.pending), [4, 2, 3]);
      assert.equal(controller.pending[1].status, OrderStatus.PENDING);

      // The cancelled timer must not complete the order later.
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.completed), [1]);
    });

    it('a returned VIP order goes back ahead of later VIP orders', () => {
      controller.addOrder(OrderType.VIP); // 1
      controller.addBot();
      controller.addOrder(OrderType.VIP); // 2
      controller.addOrder(OrderType.NORMAL); // 3
      controller.removeBot();
      assert.deepEqual(ids(controller.pending), [1, 2, 3]);
    });

    it('a re-added bot restarts the returned order from scratch', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      mock.timers.tick(5_000);
      controller.removeBot();
      controller.addBot();

      mock.timers.tick(PROCESSING_MS - 1);
      assert.equal(controller.completed.length, 0);
      mock.timers.tick(1);
      assert.deepEqual(ids(controller.completed), [1]);
    });
  });
});

describe('formatTime', () => {
  it('formats as HH:MM:SS with zero padding', () => {
    assert.equal(formatTime(new Date(2024, 0, 1, 7, 5, 9)), '07:05:09');
    assert.equal(formatTime(new Date(2024, 0, 1, 23, 59, 0)), '23:59:00');
  });
});
