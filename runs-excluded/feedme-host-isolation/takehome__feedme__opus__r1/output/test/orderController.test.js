import { beforeEach, afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrderController, OrderType, PROCESSING_TIME_MS, formatTime } from '../src/orderController.js';

const { NORMAL, VIP } = OrderType;
const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  let logs;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    logs = [];
    controller = new OrderController({ log: (m) => logs.push(m) });
  });

  afterEach(() => mock.timers.reset());

  describe('orders', () => {
    it('puts a new normal order in PENDING', () => {
      const order = controller.addOrder(NORMAL);
      assert.deepEqual(controller.pending, [order]);
      assert.deepEqual(controller.complete, []);
    });

    it('assigns unique, increasing order numbers', () => {
      const a = controller.addOrder(NORMAL);
      const b = controller.addOrder(VIP);
      const c = controller.addOrder(NORMAL);
      assert.ok(a.id < b.id && b.id < c.id);
    });

    it('places VIP orders behind existing VIPs but ahead of all normal orders', () => {
      const n1 = controller.addOrder(NORMAL);
      const v1 = controller.addOrder(VIP);
      const n2 = controller.addOrder(NORMAL);
      const v2 = controller.addOrder(VIP);
      assert.deepEqual(ids(controller.pending), [v1.id, v2.id, n1.id, n2.id]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('immediately picks up a pending order when added', () => {
      const order = controller.addOrder(NORMAL);
      const bot = controller.addBot();
      assert.equal(bot.order, order);
      assert.deepEqual(controller.pending, []);
    });

    it('completes an order after 10 seconds, not before', () => {
      const order = controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS - 1);
      assert.deepEqual(controller.complete, []);
      mock.timers.tick(1);
      assert.deepEqual(controller.complete, [order]);
    });

    it('processes one order at a time and moves on to the next', () => {
      const a = controller.addOrder(NORMAL);
      const b = controller.addOrder(NORMAL);
      const bot = controller.addBot();
      assert.equal(bot.order, a);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(bot.order, b);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.complete), [a.id, b.id]);
      assert.equal(bot.order, null);
    });

    it('processes VIP orders before normal orders', () => {
      const n = controller.addOrder(NORMAL);
      const v = controller.addOrder(VIP);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.complete), [v.id, n.id]);
    });

    it('becomes IDLE with no pending orders and wakes up for a new one', () => {
      const bot = controller.addBot();
      assert.equal(bot.order, null);
      assert.match(logs.at(-1), /Bot #1 is now IDLE/);
      const order = controller.addOrder(NORMAL);
      assert.equal(bot.order, order);
    });

    it('lets multiple bots work in parallel', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addBot();
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(controller.complete.length, 2);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      const newest = controller.addBot();
      assert.equal(controller.removeBot(), newest);
      assert.deepEqual(controller.bots.map((b) => b.id), [1]);
    });

    it('does nothing when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('stops processing and returns the order to its original position', () => {
      const v1 = controller.addOrder(VIP);
      const v2 = controller.addOrder(VIP);
      const n1 = controller.addOrder(NORMAL);
      controller.addBot(); // takes v1
      controller.addBot(); // takes v2
      controller.addOrder(VIP); // v3 queued ahead of n1
      controller.removeBot(); // v2 returns ahead of v3
      assert.deepEqual(ids(controller.pending), [v2.id, v2.id + 2, n1.id]);

      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.complete), [v1.id], 'removed bot must not complete its order');
    });

    it('returns a normal order behind VIPs but ahead of newer normal orders', () => {
      const n1 = controller.addOrder(NORMAL);
      controller.addBot(); // takes n1
      const n2 = controller.addOrder(NORMAL);
      const v1 = controller.addOrder(VIP);
      controller.removeBot();
      assert.deepEqual(ids(controller.pending), [v1.id, n1.id, n2.id]);
    });
  });

  it('formats timestamps as HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2024, 0, 1, 9, 5, 7)), '09:05:07');
  });
});
