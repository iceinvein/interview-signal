'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType } = require('../src/OrderController');

const PROCESSING_MS = 10_000;
const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    controller = new OrderController({ processingTimeMs: PROCESSING_MS });
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('places a new Normal order in PENDING', () => {
      const order = controller.addOrder(OrderType.NORMAL);
      assert.deepEqual(controller.getStatus().pending, [order]);
    });

    it('assigns unique, increasing order numbers', () => {
      const a = controller.addOrder(OrderType.NORMAL);
      const b = controller.addOrder(OrderType.VIP);
      const c = controller.addOrder(OrderType.NORMAL);
      assert.ok(a.id < b.id && b.id < c.id);
    });

    it('places VIP orders ahead of Normal orders but behind existing VIP orders', () => {
      controller.addOrder(OrderType.NORMAL); // 1
      controller.addOrder(OrderType.VIP); // 2
      controller.addOrder(OrderType.NORMAL); // 3
      controller.addOrder(OrderType.VIP); // 4
      assert.deepEqual(ids(controller.getStatus().pending), [2, 4, 1, 3]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('picks up a pending order immediately when a bot is added', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      const status = controller.getStatus();
      assert.deepEqual(status.pending, []);
      assert.deepEqual(status.processing.map((p) => [p.botId, p.order.id]), [[1, 1]]);
    });

    it('completes an order after exactly 10 seconds', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();

      mock.timers.tick(PROCESSING_MS - 1);
      assert.deepEqual(controller.getStatus().completed, []);

      mock.timers.tick(1);
      assert.deepEqual(ids(controller.getStatus().completed), [1]);
    });

    it('processes VIP orders first', () => {
      controller.addOrder(OrderType.NORMAL); // 1
      controller.addOrder(OrderType.VIP); // 2
      controller.addBot();
      mock.timers.tick(PROCESSING_MS);
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [2, 1]);
    });

    it('processes one order at a time and moves on to the next', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();

      assert.equal(controller.getStatus().processing.length, 1);
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1]);
      assert.equal(controller.getStatus().processing[0].order.id, 2);
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1, 2]);
    });

    it('processes orders in parallel with multiple bots', () => {
      controller.addOrder(OrderType.NORMAL);
      controller.addOrder(OrderType.NORMAL);
      controller.addBot();
      controller.addBot();
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1, 2]);
    });

    it('becomes IDLE when there are no pending orders, then picks up new orders', () => {
      const idle = [];
      controller.on('botIdle', (bot) => idle.push(bot.id));

      controller.addBot();
      assert.deepEqual(idle, [1]);
      assert.equal(controller.getStatus().bots[0].status, 'IDLE');

      controller.addOrder(OrderType.NORMAL);
      assert.equal(controller.getStatus().bots[0].status, 'PROCESSING');

      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(idle, [1, 1]);
      assert.equal(controller.getStatus().bots[0].status, 'IDLE');
    });

    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      const removed = controller.removeBot();
      assert.equal(removed.id, 2);
      assert.deepEqual(controller.getStatus().bots.map((b) => b.id), [1]);
    });

    it('returns null when removing a bot and none exist', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('stops processing and returns the order to its original PENDING position', () => {
      controller.addOrder(OrderType.VIP); // 1
      controller.addOrder(OrderType.VIP); // 2
      controller.addOrder(OrderType.NORMAL); // 3
      controller.addBot(); // picks 1
      controller.addBot(); // picks 2
      controller.addOrder(OrderType.VIP); // 4 -> pending [4, 3]

      controller.removeBot(); // bot 2 drops order 2
      assert.deepEqual(ids(controller.getStatus().pending), [2, 4, 3]);

      // The removed bot's timer must not complete the order.
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1]);
      assert.equal(controller.getStatus().processing[0].order.id, 2);
    });

    it('returns a Normal order behind VIP orders but ahead of newer Normal orders', () => {
      controller.addOrder(OrderType.NORMAL); // 1
      controller.addBot(); // picks 1
      controller.addOrder(OrderType.NORMAL); // 2
      controller.addOrder(OrderType.VIP); // 3
      controller.removeBot();
      assert.deepEqual(ids(controller.getStatus().pending), [3, 1, 2]);
    });

    it('does not reuse bot ids after removal', () => {
      controller.addBot();
      controller.removeBot();
      assert.equal(controller.addBot().id, 2);
    });
  });
});
