'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, ORDER_TYPE, ORDER_STATUS } = require('../src/OrderController');
const { formatTime } = require('../src/format');

const PROCESSING_MS = 10_000;
const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  let logs;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    logs = [];
    controller = new OrderController({ processingTimeMs: PROCESSING_MS, log: (line) => logs.push(line) });
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('puts a new normal order in PENDING', () => {
      const order = controller.addOrder(ORDER_TYPE.NORMAL);
      assert.equal(order.status, ORDER_STATUS.PENDING);
      assert.deepEqual(ids(controller.getStatus().pending), [order.id]);
    });

    it('assigns unique, increasing order numbers', () => {
      const created = [ORDER_TYPE.NORMAL, ORDER_TYPE.VIP, ORDER_TYPE.NORMAL, ORDER_TYPE.VIP].map((type) =>
        controller.addOrder(type),
      );
      assert.deepEqual(ids(created), [1001, 1002, 1003, 1004]);
    });

    it('places VIP orders behind existing VIP orders but ahead of normal orders', () => {
      controller.addOrder(ORDER_TYPE.NORMAL); // 1001
      controller.addOrder(ORDER_TYPE.VIP); // 1002
      controller.addOrder(ORDER_TYPE.NORMAL); // 1003
      controller.addOrder(ORDER_TYPE.VIP); // 1004
      assert.deepEqual(ids(controller.getStatus().pending), [1002, 1004, 1001, 1003]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('immediately picks up a pending order when a bot is added', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addBot();
      const status = controller.getStatus();
      assert.deepEqual(ids(status.processing), [1001]);
      assert.equal(status.pending.length, 0);
    });

    it('completes an order after 10 seconds, not before', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_MS - 1);
      assert.equal(controller.getStatus().completed.length, 0);
      mock.timers.tick(1);
      const [done] = controller.getStatus().completed;
      assert.equal(done.id, 1001);
      assert.equal(done.status, ORDER_STATUS.COMPLETE);
      assert.ok(logs.some((line) => line.includes('Processing time: 10s')));
    });

    it('processes only one order at a time and then takes the next one', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addBot();
      assert.deepEqual(ids(controller.getStatus().processing), [1001]);
      assert.deepEqual(ids(controller.getStatus().pending), [1002]);

      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1001]);
      assert.deepEqual(ids(controller.getStatus().processing), [1002]);

      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1001, 1002]);
    });

    it('processes VIP orders first', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.VIP);
      controller.addBot();
      mock.timers.tick(PROCESSING_MS);
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1002, 1001]);
    });

    it('becomes IDLE when nothing is pending and wakes up for a new order', () => {
      controller.addBot();
      assert.deepEqual(controller.getStatus().bots, [{ id: 1, orderId: null }]);
      assert.ok(logs.some((line) => line.includes('IDLE')));

      controller.addOrder(ORDER_TYPE.VIP);
      assert.deepEqual(controller.getStatus().bots, [{ id: 1, orderId: 1001 }]);

      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(controller.getStatus().bots, [{ id: 1, orderId: null }]);
      assert.match(logs.at(-1), /Bot #1 is now IDLE/);
    });

    it('lets multiple bots work in parallel', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addBot();
      controller.addBot();
      assert.equal(controller.getStatus().processing.length, 2);
      mock.timers.tick(PROCESSING_MS);
      assert.equal(controller.getStatus().completed.length, 2);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      const removed = controller.removeBot();
      assert.equal(removed.id, 2);
      assert.deepEqual(controller.getStatus().bots.map((b) => b.id), [1]);
    });

    it('does nothing when there is no bot', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('stops processing and returns the order to its original priority position', () => {
      controller.addOrder(ORDER_TYPE.VIP); // 1001
      controller.addOrder(ORDER_TYPE.NORMAL); // 1002
      controller.addBot(); // takes 1001
      controller.addBot(); // takes 1002
      controller.addOrder(ORDER_TYPE.VIP); // 1003
      controller.addOrder(ORDER_TYPE.NORMAL); // 1004
      assert.deepEqual(ids(controller.getStatus().pending), [1003, 1004]);

      controller.removeBot(); // bot #2 drops normal order 1002
      assert.deepEqual(ids(controller.getStatus().pending), [1003, 1002, 1004]);
      assert.equal(controller.getStatus().pending[1].status, ORDER_STATUS.PENDING);

      // The removed bot's timer must not complete the order.
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [1001]);
      assert.deepEqual(ids(controller.getStatus().processing), [1003]);
    });

    it('returns an order to the front when it has the highest priority', () => {
      controller.addOrder(ORDER_TYPE.VIP); // 1001
      controller.addBot();
      controller.addOrder(ORDER_TYPE.VIP); // 1002
      controller.addOrder(ORDER_TYPE.NORMAL); // 1003
      controller.removeBot();
      assert.deepEqual(ids(controller.getStatus().pending), [1001, 1002, 1003]);
    });

    it('restarts the full 10 seconds when a returned order is picked up again', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addBot();
      mock.timers.tick(5_000);
      controller.removeBot();
      controller.addBot();
      mock.timers.tick(5_000);
      assert.equal(controller.getStatus().completed.length, 0);
      mock.timers.tick(5_000);
      assert.deepEqual(ids(controller.getStatus().completed), [1001]);
    });
  });
});

describe('formatTime', () => {
  it('formats as HH:MM:SS with zero padding', () => {
    assert.equal(formatTime(new Date(2026, 0, 1, 7, 5, 9)), '07:05:09');
    assert.equal(formatTime(new Date(2026, 0, 1, 23, 59, 0)), '23:59:00');
  });
});
