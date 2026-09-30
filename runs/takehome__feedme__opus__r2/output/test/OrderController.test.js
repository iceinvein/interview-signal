import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrderController, OrderType, BotStatus } from '../src/OrderController.js';
import { formatTime } from '../src/logger.js';

const { NORMAL, VIP } = OrderType;
const pendingIds = (c) => c.getStatus().pending.map((o) => o.id);
const completedIds = (c) => c.getStatus().completed.map((o) => o.id);

describe('OrderController', () => {
  let controller;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    controller = new OrderController({ firstOrderId: 1 });
  });

  afterEach(() => {
    controller.shutdown();
    mock.timers.reset();
  });

  describe('orders', () => {
    it('puts a new normal order into PENDING', () => {
      controller.addOrder(NORMAL);
      assert.deepEqual(controller.getStatus().pending, [{ id: 1, type: NORMAL }]);
    });

    it('assigns unique, increasing order numbers', () => {
      const ids = [NORMAL, VIP, NORMAL, VIP].map((type) => controller.addOrder(type).id);
      assert.deepEqual(ids, [1, 2, 3, 4]);
    });

    it('places VIP orders behind existing VIPs but ahead of all normals', () => {
      controller.addOrder(NORMAL); // 1
      controller.addOrder(VIP); // 2
      controller.addOrder(NORMAL); // 3
      controller.addOrder(VIP); // 4
      assert.deepEqual(pendingIds(controller), [2, 4, 1, 3]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('Gold'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('immediately picks up the highest-priority pending order', () => {
      controller.addOrder(NORMAL); // 1
      controller.addOrder(VIP); // 2
      controller.addBot();
      assert.deepEqual(controller.getStatus().bots, [{ id: 1, status: BotStatus.PROCESSING, orderId: 2 }]);
      assert.deepEqual(pendingIds(controller), [1]);
    });

    it('completes an order after exactly 10 seconds', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(9_999);
      assert.deepEqual(completedIds(controller), []);
      mock.timers.tick(1);
      assert.deepEqual(completedIds(controller), [1]);
    });

    it('processes one order at a time, then picks up the next', () => {
      controller.addOrder(NORMAL); // 1
      controller.addOrder(NORMAL); // 2
      controller.addBot();
      mock.timers.tick(10_000);
      assert.deepEqual(completedIds(controller), [1]);
      assert.equal(controller.getStatus().bots[0].orderId, 2);
      mock.timers.tick(10_000);
      assert.deepEqual(completedIds(controller), [1, 2]);
    });

    it('becomes IDLE when nothing is pending and wakes up for a new order', () => {
      controller.addBot();
      assert.equal(controller.getStatus().bots[0].status, BotStatus.IDLE);
      controller.addOrder(VIP);
      assert.equal(controller.getStatus().bots[0].status, BotStatus.PROCESSING);
    });

    it('lets multiple bots work in parallel', () => {
      controller.addOrder(NORMAL);
      controller.addOrder(NORMAL);
      controller.addBot();
      controller.addBot();
      mock.timers.tick(10_000);
      assert.deepEqual(completedIds(controller), [1, 2]);
    });

    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      assert.equal(controller.removeBot().id, 2);
      assert.deepEqual(controller.getStatus().bots.map((b) => b.id), [1]);
    });

    it('returns an interrupted order to its original position and never completes it', () => {
      controller.addOrder(VIP); // 1
      controller.addOrder(NORMAL); // 2
      controller.addBot(); // takes VIP 1
      controller.addBot(); // takes Normal 2
      controller.addOrder(VIP); // 3
      controller.addOrder(NORMAL); // 4
      assert.deepEqual(pendingIds(controller), [3, 4]);

      controller.removeBot(); // drops Normal 2
      assert.deepEqual(pendingIds(controller), [3, 2, 4]);

      mock.timers.tick(10_000);
      assert.deepEqual(completedIds(controller), [1]);
    });

    it('restarts the full 10 seconds when a returned order is picked up again', () => {
      controller.addOrder(NORMAL);
      controller.addBot();
      mock.timers.tick(5_000);
      controller.removeBot();
      controller.addBot();
      mock.timers.tick(9_999);
      assert.deepEqual(completedIds(controller), []);
      mock.timers.tick(1);
      assert.deepEqual(completedIds(controller), [1]);
    });

    it('does nothing when removing a bot while none exist', () => {
      assert.equal(controller.removeBot(), null);
    });
  });

  describe('events', () => {
    it('reports each state change', () => {
      const events = [];
      const c = new OrderController({ onEvent: (e) => events.push(e), firstOrderId: 1 });
      c.addOrder(VIP);
      c.addBot();
      mock.timers.tick(10_000);
      assert.deepEqual(events, [
        'Created VIP Order #1 - Status: PENDING',
        'Bot #1 created - Status: ACTIVE',
        'Bot #1 picked up VIP Order #1 - Status: PROCESSING',
        'Bot #1 completed VIP Order #1 - Status: COMPLETE (Processing time: 10s)',
        'Bot #1 is now IDLE - No pending orders',
      ]);
    });
  });
});

describe('formatTime', () => {
  it('formats as zero-padded HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2024, 0, 1, 7, 5, 3)), '07:05:03');
  });
});
