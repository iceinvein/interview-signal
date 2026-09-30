import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrderController, OrderType, OrderStatus, PROCESSING_TIME_MS } from '../src/orderController.js';
import { formatTime } from '../src/logger.js';

const { NORMAL, VIP } = OrderType;
const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    controller = new OrderController();
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('puts a new normal order into PENDING', () => {
      const order = controller.addOrder(NORMAL);
      assert.equal(order.status, OrderStatus.PENDING);
      assert.deepEqual(controller.pending, [order]);
    });

    it('gives unique, increasing order numbers', () => {
      const [a, b, c] = [controller.addOrder(NORMAL), controller.addOrder(VIP), controller.addOrder(NORMAL)];
      assert.ok(a.id < b.id && b.id < c.id);
    });

    it('queues VIP orders behind existing VIPs but ahead of normal orders', () => {
      const n1 = controller.addOrder(NORMAL);
      const v1 = controller.addOrder(VIP);
      const n2 = controller.addOrder(NORMAL);
      const v2 = controller.addOrder(VIP);
      assert.deepEqual(ids(controller.pending), [v1.id, v2.id, n1.id, n2.id]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('GOLD'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('picks up the highest priority order immediately when added', () => {
      controller.addOrder(NORMAL);
      const vip = controller.addOrder(VIP);
      const bot = controller.addBot();
      assert.equal(bot.order, vip);
      assert.equal(vip.status, OrderStatus.PROCESSING);
      assert.equal(controller.pending.length, 1);
    });

    it('completes an order after 10 seconds, not before', () => {
      const order = controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS - 1);
      assert.equal(controller.complete.length, 0);
      mock.timers.tick(1);
      assert.deepEqual(controller.complete, [order]);
      assert.equal(order.status, OrderStatus.COMPLETE);
    });

    it('processes one order at a time, then moves on to the next', () => {
      const [a, b] = [controller.addOrder(NORMAL), controller.addOrder(NORMAL)];
      const bot = controller.addBot();
      assert.equal(bot.order, a);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(bot.order, b);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.complete), [a.id, b.id]);
    });

    it('goes IDLE when nothing is pending and wakes up on a new order', () => {
      const idle = mock.fn();
      controller.on('bot:idle', idle);
      const bot = controller.addBot();
      assert.equal(idle.mock.callCount(), 1);
      assert.equal(bot.order, null);

      const order = controller.addOrder(NORMAL);
      assert.equal(bot.order, order);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(idle.mock.callCount(), 2);
    });

    it('runs multiple bots in parallel', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addBot();
      controller.addBot();
      assert.equal(controller.pending.length, 0);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(controller.complete.length, 2);
    });

    it('reports the elapsed processing time on completion', () => {
      const completed = mock.fn();
      controller.on('order:completed', completed);
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(completed.mock.calls[0].arguments[2], PROCESSING_TIME_MS);
    });
  });

  describe('removing bots', () => {
    it('does nothing when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('removes the newest bot', () => {
      controller.addBot();
      const newest = controller.addBot();
      assert.equal(controller.removeBot(), newest);
      assert.equal(controller.bots.length, 1);
    });

    it('stops processing and returns the order to its original position', () => {
      const n1 = controller.addOrder(NORMAL);
      const n2 = controller.addOrder(NORMAL);
      controller.addBot(); // takes n1
      controller.addOrder(VIP); // queued ahead of n2
      const v2 = controller.addOrder(VIP);
      const v1 = controller.pending[0];

      controller.removeBot();

      assert.equal(n1.status, OrderStatus.PENDING);
      assert.deepEqual(ids(controller.pending), [v1.id, v2.id, n1.id, n2.id]);
      mock.timers.tick(PROCESSING_TIME_MS * 2);
      assert.equal(controller.complete.length, 0, 'the cancelled order must never complete');
    });

    it('lets an idle bot pick up a returned order, restarting the 10s timer', () => {
      const a = controller.addOrder(NORMAL);
      const older = controller.addBot(); // takes a
      mock.timers.tick(PROCESSING_TIME_MS / 2);
      const b = controller.addOrder(NORMAL);
      controller.addBot(); // takes b
      mock.timers.tick(PROCESSING_TIME_MS / 2); // older completes a and goes IDLE
      assert.equal(older.order, null);

      controller.removeBot(); // b returns to PENDING, older picks it up
      assert.equal(older.order, b);
      mock.timers.tick(PROCESSING_TIME_MS - 1);
      assert.equal(b.status, OrderStatus.PROCESSING);
      mock.timers.tick(1);
      assert.deepEqual(ids(controller.complete), [a.id, b.id]);
    });
  });
});

describe('formatTime', () => {
  it('formats as zero-padded HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2020, 0, 1, 7, 5, 3)), '07:05:03');
    assert.equal(formatTime(new Date(2020, 0, 1, 23, 59, 59)), '23:59:59');
  });
});
