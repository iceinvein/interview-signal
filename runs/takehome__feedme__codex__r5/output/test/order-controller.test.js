'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { OrderController, PROCESSING_MS } = require('../src/order-controller');

function fakeClock() {
  let now = Date.UTC(2026, 8, 30, 12, 0, 0);
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!due || due[1].at > target) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
  };
}

function ids(orders) {
  return orders.map((order) => order.id);
}

test('pending queue gives VIP orders priority while preserving FIFO within each type', () => {
  const controller = new OrderController({ ...fakeClock() });
  assert.equal(controller.addOrder('NORMAL').id, 1001);
  assert.equal(controller.addOrder('VIP').id, 1002);
  assert.equal(controller.addOrder('NORMAL').id, 1003);
  assert.equal(controller.addOrder('VIP').id, 1004);
  assert.deepEqual(ids(controller.getStatus().pending), [1002, 1004, 1001, 1003]);
  assert.throws(() => controller.addOrder('OTHER'), /NORMAL or VIP/);
  assert.equal(controller.getStatus().pending.length, 4);
});

test('bots process one order each for 10 seconds, then take the next order or become idle', () => {
  const clock = fakeClock();
  const controller = new OrderController({ ...clock });
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  assert.equal(controller.addBot(), 1);
  assert.equal(controller.addBot(), 2);
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.orderId), [1002, 1001]);

  clock.advance(PROCESSING_MS - 1);
  assert.deepEqual(ids(controller.getStatus().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.getStatus().complete), [1002, 1001]);
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.orderId), [1003, null]);
  clock.advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.getStatus().complete), [1002, 1001, 1003]);
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.status), ['IDLE', 'IDLE']);
  for (const order of controller.getStatus().complete) {
    assert.equal(order.completedAt - order.startedAt, PROCESSING_MS);
  }
});

test('an idle bot immediately picks up a newly arrived order', () => {
  const clock = fakeClock();
  const controller = new OrderController({ ...clock });
  controller.addBot();
  const order = controller.addOrder('VIP');
  assert.equal(order.status, 'PROCESSING');
  assert.deepEqual(ids(controller.getStatus().processing), [1001]);
  clock.advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.getStatus().complete), [1001]);
  assert.equal(controller.getStatus().bots[0].status, 'IDLE');
});

test('removing the newest busy bot cancels work and restores the order to its original queue rank', () => {
  const clock = fakeClock();
  const controller = new OrderController({ ...clock });
  controller.addOrder('NORMAL'); // #1001
  controller.addOrder('VIP');    // #1002
  controller.addOrder('VIP');    // #1003
  controller.addOrder('NORMAL'); // #1004
  controller.addBot();
  controller.addBot();
  clock.advance(5_000);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.getStatus().pending), [1003, 1001, 1004]);
  assert.deepEqual(ids(controller.getStatus().processing), [1002]);
  assert.equal(controller.getStatus().pending[0].startedAt, null);

  controller.addBot();
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.id), [1, 3]);
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.orderId), [1002, 1003]);
  clock.advance(5_000);
  assert.deepEqual(ids(controller.getStatus().complete), [1002]);
  assert.deepEqual(ids(controller.getStatus().processing), [1003, 1001]);
  clock.advance(5_000);
  assert.deepEqual(ids(controller.getStatus().complete), [1002, 1003]);
  assert.equal(controller.getStatus().complete[1].completedAt -
    controller.getStatus().complete[1].startedAt, PROCESSING_MS);
});

test('removing an idle bot is safe, and removing the last bot leaves work pending', () => {
  const clock = fakeClock();
  const controller = new OrderController({ ...clock });
  assert.equal(controller.removeBot(), null);
  controller.addBot();
  assert.equal(controller.removeBot(), 1);
  controller.addOrder('NORMAL');
  assert.deepEqual(ids(controller.getStatus().pending), [1001]);
  assert.equal(controller.getStatus().complete.length, 0);
});

test('interactive CLI accepts commands and prints timestamped status', () => {
  const cli = path.join(__dirname, '../src/cli.js');
  const result = spawnSync(process.execPath, [cli, '--interactive'], {
    input: 'normal\nvip\nstatus\n+\n-\nstatus\nquit\n',
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PENDING: #1002 VIP, #1001 NORMAL/);
  assert.match(result.stdout, /Bot #1 picked up VIP order #1002/);
  assert.match(result.stdout, /returned to PENDING/);
  assert.match(result.stdout, /BOTS: \(none\)/);
  for (const outputLine of result.stdout.trim().split('\n')) {
    assert.match(outputLine, /^\[\d{2}:\d{2}:\d{2}\] /);
  }
});
