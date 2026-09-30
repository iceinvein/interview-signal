'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, OrderType } = require('../src/OrderController');
const { attachLogger, formatTime } = require('../src/logger');

describe('logger', () => {
  it('formats timestamps as HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2026, 0, 1, 9, 5, 3)), '09:05:03');
  });

  it('writes timestamped lines for controller events', () => {
    const lines = [];
    const controller = new OrderController();
    attachLogger(controller, (line) => lines.push(line), () => new Date(2026, 0, 1, 14, 32, 1));

    controller.addOrder(OrderType.VIP);
    controller.addBot();
    controller.removeBot();

    assert.deepEqual(lines, [
      '[14:32:01] Created VIP Order #1 - Status: PENDING',
      '[14:32:01] Bot #1 created',
      '[14:32:01] Bot #1 picked up VIP Order #1 - Status: PROCESSING',
      '[14:32:01] Bot #1 destroyed while processing VIP Order #1',
      '[14:32:01] VIP Order #1 returned to PENDING',
    ]);
  });
});
