import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrderController, OrderType, BotStatus, PROCESSING_TIME_MS } from '../src/orderController.js';
import { timestamp } from '../src/logger.js';

const { NORMAL, VIP } = OrderType;
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
    it('puts a new normal order in PENDING', () => {
      const order = controller.addOrder(NORMAL);
      assert.deepEqual(controller.getState().pending, [{ id: order.id, type: NORMAL }]);
    });

    it('assigns unique, increasing order numbers', () => {
      const orderIds = [NORMAL, VIP, NORMAL, VIP].map((t) => controller.addOrder(t).id);
      assert.deepEqual(orderIds, [1001, 1002, 1003, 1004]);
    });

    it('places VIP orders behind existing VIPs but ahead of all normals', () => {
      controller.addOrder(NORMAL); // 1001
      controller.addOrder(VIP); // 1002
      controller.addOrder(NORMAL); // 1003
      controller.addOrder(VIP); // 1004
      assert.deepEqual(ids(controller.getState().pending), [1002, 1004, 1001, 1003]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('immediately picks up a pending order when added', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      const { pending, bots } = controller.getState();
      assert.equal(pending.length, 0);
      assert.deepEqual(bots, [{ id: 1, status: BotStatus.PROCESSING, orderId: 1001 }]);
    });

    it('picks up VIP orders first', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(VIP);
      controller.addBot();
      assert.equal(controller.getState().bots[0].orderId, 1002);
    });

    it('completes an order after exactly 10 seconds', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS - 1);
      assert.equal(controller.getState().complete.length, 0);
      mock.timers.tick(1);
      assert.deepEqual(ids(controller.getState().complete), [1001]);
    });

    it('processes the next pending order after completing one', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(controller.getState().bots[0].orderId, 1002);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.getState().complete), [1001, 1002]);
    });

    it('becomes IDLE when there is nothing pending, then resumes on a new order', () => {
      controller.addBot();
      assert.equal(controller.getState().bots[0].status, BotStatus.IDLE);
      controller.addOrder(VIP);
      assert.deepEqual(controller.getState().bots[0], { id: 1, status: BotStatus.PROCESSING, orderId: 1001 });
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.equal(controller.getState().bots[0].status, BotStatus.IDLE);
      assert.ok(logs.at(-1).includes('IDLE'));
    });

    it('processes one order per bot concurrently', () => {
      [NORMAL, NORMAL, NORMAL].forEach((t) => controller.addOrder(t));
      controller.addBot();
      controller.addBot();
      assert.deepEqual(ids(controller.getState().pending), [1003]);
      mock.timers.tick(PROCESSING_TIME_MS);
      assert.deepEqual(ids(controller.getState().complete), [1001, 1002]);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      assert.equal(controller.removeBot().id, 2);
      assert.deepEqual(controller.getState().bots.map((b) => b.id), [1]);
    });

    it('returns a processing order to its original position in PENDING', () => {
      controller.addOrder(VIP); // 1001 -> bot 1
      controller.addOrder(NORMAL); // 1002 -> bot 2
      controller.addBot();
      controller.addBot();
      controller.addOrder(VIP); // 1003
      controller.addOrder(NORMAL); // 1004
      controller.removeBot(); // bot 2 drops 1002
      assert.deepEqual(ids(controller.getState().pending), [1003, 1002, 1004]);
    });

    it('stops processing: the removed order is not completed', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS / 2);
      controller.removeBot();
      mock.timers.tick(PROCESSING_TIME_MS * 2);
      const { pending, complete } = controller.getState();
      assert.deepEqual(ids(pending), [1001]);
      assert.equal(complete.length, 0);
    });

    it('restarts a returned order from scratch on the next bot', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS / 2);
      controller.removeBot();
      controller.addBot();
      mock.timers.tick(PROCESSING_TIME_MS - 1);
      assert.equal(controller.getState().complete.length, 0);
      mock.timers.tick(1);
      assert.deepEqual(ids(controller.getState().complete), [1001]);
    });

    it('is a no-op when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });
  });
});

describe('timestamp', () => {
  it('formats as HH:MM:SS', () => {
    assert.equal(timestamp(new Date(2024, 0, 1, 9, 5, 7)), '09:05:07');
  });
});
