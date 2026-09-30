'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, ORDER_TYPE, ORDER_STATUS } = require('../src/orderController');

const { NORMAL, VIP } = ORDER_TYPE;
const PROCESSING_MS = 10_000;

const ids = (orders) => orders.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  let logs;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    logs = [];
    controller = new OrderController({ log: (m) => logs.push(m) });
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('places a new normal order in PENDING', () => {
      const order = controller.addOrder(NORMAL);
      assert.equal(order.status, ORDER_STATUS.PENDING);
      assert.deepEqual(ids(controller.getStatus().pending), [order.id]);
    });

    it('assigns unique, increasing order numbers', () => {
      const orderIds = [controller.addOrder(NORMAL), controller.addOrder(VIP), controller.addOrder(NORMAL)].map((o) => o.id);
      assert.deepEqual(orderIds, [1001, 1002, 1003]);
    });

    it('queues VIP orders behind existing VIP orders but ahead of normal orders', () => {
      const n1 = controller.addOrder(NORMAL);
      const v1 = controller.addOrder(VIP);
      const n2 = controller.addOrder(NORMAL);
      const v2 = controller.addOrder(VIP);
      assert.deepEqual(ids(controller.getStatus().pending), [v1.id, v2.id, n1.id, n2.id]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('picks up the highest priority order immediately when added', () => {
      controller.addOrder(NORMAL);
      const vip = controller.addOrder(VIP);
      controller.addBot();
      const { processing, pending } = controller.getStatus();
      assert.equal(processing[0].order.id, vip.id);
      assert.equal(processing[0].order.status, ORDER_STATUS.PROCESSING);
      assert.equal(pending.length, 1);
    });

    it('completes an order after 10 seconds, not before', () => {
      const order = controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_MS - 1);
      assert.equal(controller.getStatus().completed.length, 0);
      mock.timers.tick(1);
      const { completed } = controller.getStatus();
      assert.deepEqual(ids(completed), [order.id]);
      assert.equal(completed[0].status, ORDER_STATUS.COMPLETE);
    });

    it('processes the next pending order after completing one', () => {
      const first = controller.addOrder(NORMAL);
      const second = controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_MS);
      assert.equal(controller.getStatus().processing[0].order.id, second.id);
      mock.timers.tick(PROCESSING_MS);
      assert.deepEqual(ids(controller.getStatus().completed), [first.id, second.id]);
    });

    it('becomes IDLE when nothing is pending and resumes when a new order arrives', () => {
      controller.addBot();
      assert.equal(controller.getStatus().bots[0].status, 'IDLE');
      const order = controller.addOrder(NORMAL);
      assert.equal(controller.getStatus().bots[0].orderId, order.id);
      mock.timers.tick(PROCESSING_MS);
      assert.equal(controller.getStatus().bots[0].status, 'IDLE');
      assert.ok(logs.includes('Bot #1 is now IDLE - No pending orders'));
    });

    it('processes one order per bot concurrently', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addBot();
      controller.addBot();
      const { processing, pending } = controller.getStatus();
      assert.equal(processing.length, 2);
      assert.equal(pending.length, 1);
      mock.timers.tick(PROCESSING_MS);
      assert.equal(controller.getStatus().completed.length, 2);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      assert.equal(controller.removeBot().id, 2);
      assert.deepEqual(controller.getStatus().bots.map((b) => b.id), [1]);
    });

    it('does nothing when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('returns the in-progress order to its original PENDING position and never completes it', () => {
      const v1 = controller.addOrder(VIP);
      const n1 = controller.addOrder(NORMAL);
      controller.addBot(); // takes v1
      const v2 = controller.addOrder(VIP);
      const n2 = controller.addOrder(NORMAL);

      mock.timers.tick(PROCESSING_MS / 2);
      controller.removeBot();

      const { pending } = controller.getStatus();
      assert.deepEqual(ids(pending), [v1.id, v2.id, n1.id, n2.id]);
      assert.equal(pending[0].status, ORDER_STATUS.PENDING);

      mock.timers.tick(PROCESSING_MS);
      assert.equal(controller.getStatus().completed.length, 0);
    });

    it('restarts a returned order from scratch when another bot picks it up', () => {
      const order = controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_MS / 2);
      controller.removeBot();
      controller.addBot();
      mock.timers.tick(PROCESSING_MS - 1);
      assert.equal(controller.getStatus().completed.length, 0);
      mock.timers.tick(1);
      assert.deepEqual(ids(controller.getStatus().completed), [order.id]);
    });

    it('bot ids stay unique after removal', () => {
      controller.addBot();
      controller.removeBot();
      assert.equal(controller.addBot().id, 2);
    });
  });
});
