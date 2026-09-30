'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, ORDER_TYPE, BOT_STATUS } = require('../src/OrderController');

const TEN_SECONDS = 10_000;
const pendingIds = (c) => c.getStatus().pending.map((o) => o.id);
const completedIds = (c) => c.getStatus().completed.map((o) => o.id);

describe('OrderController', () => {
  let controller;
  let events;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    events = [];
    controller = new OrderController({ onEvent: (message) => events.push(message) });
  });

  afterEach(() => mock.timers.reset());

  const tick = (ms) => mock.timers.tick(ms);
  // A single tick() does not fire timers scheduled during it, so advance one cooking cycle at a time.
  const cookCycles = (n) => Array.from({ length: n }).forEach(() => tick(TEN_SECONDS));

  describe('orders', () => {
    it('adds a normal order to PENDING', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      assert.deepEqual(controller.getStatus().pending, [{ id: 1, type: ORDER_TYPE.NORMAL }]);
    });

    it('assigns unique, increasing order numbers', () => {
      const ids = [ORDER_TYPE.NORMAL, ORDER_TYPE.VIP, ORDER_TYPE.NORMAL].map((t) => controller.addOrder(t).id);
      assert.deepEqual(ids, [1, 2, 3]);
    });

    it('places VIP orders behind existing VIPs but ahead of all normal orders', () => {
      controller.addOrder(ORDER_TYPE.NORMAL); // 1
      controller.addOrder(ORDER_TYPE.VIP); //    2
      controller.addOrder(ORDER_TYPE.NORMAL); // 3
      controller.addOrder(ORDER_TYPE.VIP); //    4
      assert.deepEqual(pendingIds(controller), [2, 4, 1, 3]);
    });

    it('rejects unknown order types', () => {
      assert.throws(() => controller.addOrder('GOLD'), /Unknown order type/);
    });
  });

  describe('bots', () => {
    it('picks up the highest-priority pending order immediately when added', () => {
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.VIP);
      controller.addBot();
      assert.deepEqual(controller.getStatus().bots, [{ id: 1, status: BOT_STATUS.PROCESSING, orderId: 2 }]);
      assert.deepEqual(pendingIds(controller), [1]);
    });

    it('completes an order after 10 seconds, not before', () => {
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL);
      tick(TEN_SECONDS - 1);
      assert.deepEqual(completedIds(controller), []);
      tick(1);
      assert.deepEqual(completedIds(controller), [1]);
    });

    it('processes one order at a time and then takes the next one', () => {
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.NORMAL);
      assert.deepEqual(pendingIds(controller), [2]);
      tick(TEN_SECONDS);
      assert.deepEqual(completedIds(controller), [1]);
      assert.equal(controller.getStatus().bots[0].orderId, 2);
      tick(TEN_SECONDS);
      assert.deepEqual(completedIds(controller), [1, 2]);
    });

    it('becomes IDLE when nothing is pending and wakes up for a new order', () => {
      controller.addBot();
      assert.equal(controller.getStatus().bots[0].status, BOT_STATUS.IDLE);
      controller.addOrder(ORDER_TYPE.VIP);
      tick(TEN_SECONDS);
      assert.equal(controller.getStatus().bots[0].status, BOT_STATUS.IDLE);
      assert.ok(events.includes('Bot #1 is now IDLE - No pending orders'));
      controller.addOrder(ORDER_TYPE.NORMAL);
      assert.equal(controller.getStatus().bots[0].orderId, 2);
    });

    it('processes orders in parallel across bots', () => {
      controller.addBot();
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL);
      controller.addOrder(ORDER_TYPE.NORMAL);
      tick(TEN_SECONDS);
      assert.deepEqual(completedIds(controller), [1, 2]);
    });
  });

  describe('removing bots', () => {
    it('removes the newest bot', () => {
      controller.addBot();
      controller.addBot();
      assert.equal(controller.removeBot().id, 2);
      assert.deepEqual(controller.getStatus().bots.map((b) => b.id), [1]);
    });

    it('is a no-op when there are no bots', () => {
      assert.equal(controller.removeBot(), null);
    });

    it('stops processing and returns the order to its original priority position', () => {
      controller.addOrder(ORDER_TYPE.VIP); //    1 -> bot 1
      controller.addOrder(ORDER_TYPE.NORMAL); // 2 -> bot 2
      controller.addBot();
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL); // 3
      controller.addOrder(ORDER_TYPE.VIP); //    4
      assert.deepEqual(pendingIds(controller), [4, 3]);

      controller.removeBot(); // bot 2 was cooking normal order #2
      assert.deepEqual(pendingIds(controller), [4, 2, 3]);

      cookCycles(4); // bot 1 alone: #1, then #4, #2, #3
      assert.deepEqual(completedIds(controller), [1, 4, 2, 3]);
    });

    it('never completes the order of a destroyed bot', () => {
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL);
      tick(TEN_SECONDS / 2);
      controller.removeBot();
      cookCycles(2);
      assert.deepEqual(completedIds(controller), []);
      assert.deepEqual(pendingIds(controller), [1]);
    });

    it('restarts the returned order from scratch on the next bot', () => {
      controller.addBot();
      controller.addOrder(ORDER_TYPE.NORMAL);
      tick(TEN_SECONDS / 2);
      controller.removeBot();
      controller.addBot();
      tick(TEN_SECONDS - 1);
      assert.deepEqual(completedIds(controller), []);
      tick(1);
      assert.deepEqual(completedIds(controller), [1]);
    });
  });
});
