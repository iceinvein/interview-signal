'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController } = require('../src/orderController');

// Fake clock: timers fire only when advance() is called.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      scheduled.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      scheduled.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...scheduled.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        scheduled.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
  };
}

function setup() {
  const timers = fakeTimers();
  const events = [];
  const controller = new OrderController({ timers, onEvent: (e) => events.push(e) });
  const pendingIds = () => controller.status().pending.map((o) => o.id);
  return { timers, events, controller, pendingIds };
}

test('normal order goes to PENDING', () => {
  const { controller, pendingIds } = setup();
  controller.addOrder(false);
  assert.deepStrictEqual(pendingIds(), [1]);
});

test('order numbers are unique and increasing', () => {
  const { controller } = setup();
  const ids = [false, true, false].map((vip) => controller.addOrder(vip).id);
  assert.deepStrictEqual(ids, [1, 2, 3]);
});

test('VIP goes ahead of normal orders but behind earlier VIPs', () => {
  const { controller, pendingIds } = setup();
  controller.addOrder(false); // 1
  controller.addOrder(true); // 2
  controller.addOrder(false); // 3
  controller.addOrder(true); // 4
  assert.deepStrictEqual(pendingIds(), [2, 4, 1, 3]);
});

test('bot processes an order in 10s then moves it to COMPLETE', () => {
  const { controller, timers } = setup();
  controller.addOrder(false);
  controller.addBot();
  assert.deepStrictEqual(controller.status().pending, []);
  timers.advance(9999);
  assert.strictEqual(controller.status().complete.length, 0);
  timers.advance(1);
  assert.deepStrictEqual(controller.status().complete.map((o) => o.id), [1]);
});

test('new bot immediately picks up pending orders', () => {
  const { controller, pendingIds } = setup();
  controller.addOrder(false);
  controller.addOrder(false);
  controller.addBot();
  assert.deepStrictEqual(pendingIds(), [2]);
  assert.strictEqual(controller.status().processing.length, 1);
});

test('bot takes the next pending order after finishing, then goes IDLE', () => {
  const { controller, timers, events } = setup();
  controller.addBot();
  controller.addOrder(false);
  controller.addOrder(false);
  timers.advance(10000);
  assert.strictEqual(controller.status().processing[0].order, 2);
  timers.advance(10000);
  assert.strictEqual(controller.status().idleBots, 1);
  assert.match(events[events.length - 1], /Bot #1 is now IDLE/);
});

test('idle bot picks up a newly created order', () => {
  const { controller } = setup();
  controller.addBot();
  controller.addOrder(true);
  assert.deepStrictEqual(controller.status().processing, [{ bot: 1, order: 1 }]);
});

test('each bot handles only one order at a time', () => {
  const { controller, pendingIds } = setup();
  controller.addBot();
  controller.addOrder(false);
  controller.addOrder(false);
  assert.strictEqual(controller.status().processing.length, 1);
  assert.deepStrictEqual(pendingIds(), [2]);
});

test('removing the newest bot returns its order to original position and stops processing', () => {
  const { controller, timers, pendingIds } = setup();
  controller.addOrder(false); // 1
  controller.addOrder(false); // 2
  controller.addOrder(false); // 3
  controller.addBot(); // bot1 -> 1
  controller.addBot(); // bot2 -> 2
  controller.removeBot(); // removes bot2, order 2 back to front of pending
  assert.deepStrictEqual(pendingIds(), [2, 3]);
  assert.strictEqual(controller.status().bots, 1);
  timers.advance(10000);
  // the cancelled timer must not complete order 2; bot1 finished 1 and took 2
  assert.deepStrictEqual(controller.status().complete.map((o) => o.id), [1]);
  assert.deepStrictEqual(controller.status().processing, [{ bot: 1, order: 2 }]);
});

test('returned VIP order stays behind earlier VIP and ahead of normal orders', () => {
  const { controller, pendingIds } = setup();
  controller.addOrder(true); // 1
  controller.addBot(); // bot1 takes 1
  controller.addOrder(false); // 2
  controller.addOrder(true); // 3 -> picked? no: bot busy; pending [3,2]
  controller.addOrder(true); // 4
  controller.removeBot(); // order 1 returns to very front
  assert.deepStrictEqual(pendingIds(), [1, 3, 4, 2]);
});

test('removing an idle bot or a nonexistent bot is safe', () => {
  const { controller } = setup();
  assert.strictEqual(controller.removeBot(), null);
  controller.addBot();
  controller.removeBot();
  assert.strictEqual(controller.status().bots, 0);
});

test('orders stay pending when no bots, and resume when a bot is added', () => {
  const { controller, timers } = setup();
  controller.addOrder(false);
  timers.advance(60000);
  assert.strictEqual(controller.status().pending.length, 1);
  controller.addBot();
  timers.advance(10000);
  assert.strictEqual(controller.status().complete.length, 1);
});
