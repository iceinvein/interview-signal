'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController, ORDER_TYPE } = require('../src/orderController');
const { formatStatus, timestamp } = require('../src/cli');

/** Deterministic replacement for setTimeout/clearTimeout. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const tasks = new Map();
  return {
    setTimeout(fn, ms) {
      const id = ++seq;
      tasks.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...tasks.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        tasks.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
  };
}

const setup = () => {
  const timers = fakeTimers();
  const controller = new OrderController({ timers });
  return { timers, controller };
};
const ids = (list) => list.map((o) => o.id);

test('normal order appears in PENDING', () => {
  const { controller } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL);
  assert.deepStrictEqual(ids(controller.status().pending), [1]);
});

test('order numbers are unique and increasing', () => {
  const { controller } = setup();
  const created = [ORDER_TYPE.NORMAL, ORDER_TYPE.VIP, ORDER_TYPE.NORMAL].map((t) => controller.addOrder(t).id);
  assert.deepStrictEqual(created, [1, 2, 3]);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  const { controller } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL); // 1
  controller.addOrder(ORDER_TYPE.VIP); // 2
  controller.addOrder(ORDER_TYPE.NORMAL); // 3
  controller.addOrder(ORDER_TYPE.VIP); // 4
  assert.deepStrictEqual(ids(controller.status().pending), [2, 4, 1, 3]);
});

test('bot completes an order after 10 seconds and moves it to COMPLETE', () => {
  const { controller, timers } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addBot();
  assert.deepStrictEqual(controller.status().pending, []);
  timers.advance(9999);
  assert.deepStrictEqual(ids(controller.status().complete), []);
  timers.advance(1);
  assert.deepStrictEqual(ids(controller.status().complete), [1]);
});

test('adding a bot immediately processes pending orders', () => {
  const { controller } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addBot();
  assert.deepStrictEqual(ids(controller.status().pending), [2]);
  assert.strictEqual(controller.status().bots[0].state, 'PROCESSING');
});

test('bot picks up the next order after finishing, then goes IDLE', () => {
  const { controller, timers } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addBot();
  timers.advance(10000);
  assert.strictEqual(controller.status().bots[0].orderId, 2);
  timers.advance(10000);
  assert.deepStrictEqual(ids(controller.status().complete), [1, 2]);
  assert.strictEqual(controller.status().bots[0].state, 'IDLE');
});

test('idle bot picks up a new order immediately', () => {
  const { controller } = setup();
  controller.addBot();
  controller.addOrder(ORDER_TYPE.VIP);
  assert.strictEqual(controller.status().bots[0].orderId, 1);
});

test('a bot processes only one order at a time', () => {
  const { controller } = setup();
  controller.addBot();
  controller.addOrder(ORDER_TYPE.NORMAL);
  controller.addOrder(ORDER_TYPE.NORMAL);
  assert.deepStrictEqual(ids(controller.status().pending), [2]);
});

test('removing the newest bot returns its order to its original position', () => {
  const { controller, timers } = setup();
  controller.addOrder(ORDER_TYPE.NORMAL); // 1
  controller.addOrder(ORDER_TYPE.NORMAL); // 2
  controller.addBot(); // takes 1
  controller.addBot(); // takes 2
  controller.addOrder(ORDER_TYPE.NORMAL); // 3
  controller.addOrder(ORDER_TYPE.VIP); // 4
  controller.removeBot(); // bot 2 dropped, order 2 back
  assert.deepStrictEqual(ids(controller.status().pending), [4, 2, 3]);
  assert.deepStrictEqual(controller.status().bots.map((b) => b.id), [1]);
  timers.advance(10000); // the destroyed bot's timer must not complete order 2
  assert.deepStrictEqual(ids(controller.status().complete), [1]);
});

test('removing a bot hands its order to another idle bot', () => {
  const { controller } = setup();
  controller.addBot(); // 1
  controller.addOrder(ORDER_TYPE.NORMAL); // bot 1 takes it
  controller.addBot(); // 2 idle
  controller.removeBot(); // removes bot 2 (idle)
  assert.strictEqual(controller.status().bots[0].orderId, 1);
});

test('removeBot with no bots is a no-op', () => {
  const { controller } = setup();
  assert.strictEqual(controller.removeBot(), null);
});

test('bot ids stay unique after removal', () => {
  const { controller } = setup();
  controller.addBot();
  controller.removeBot();
  assert.strictEqual(controller.addBot().id, 2);
});

test('formatStatus and timestamp produce readable output', () => {
  const { controller } = setup();
  controller.addOrder(ORDER_TYPE.VIP);
  assert.match(formatStatus(controller.status()), /PENDING: \[VIP#1\]/);
  assert.match(timestamp(), /^\d{2}:\d{2}:\d{2}$/);
});
