'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OrderController } = require('../src/order-controller');

function fixture() {
  let time = Date.UTC(2026, 0, 1, 12, 0, 0);
  let nextTimerId = 1;
  const timers = new Map();
  const events = [];
  const controller = new OrderController({
    now: () => time,
    setTimer: (fn, ms) => {
      const id = nextTimerId++;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimer: id => timers.delete(id),
    onEvent: line => events.push(line)
  });
  function advance(ms) {
    const until = time + ms;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      time = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    time = until;
  }
  return { controller, advance, events, timers };
}

test('orders have increasing IDs; VIP and normal each keep arrival order', () => {
  const { controller } = fixture();
  assert.equal(controller.addOrder('Normal'), 1);
  assert.equal(controller.addOrder('VIP'), 2);
  assert.equal(controller.addOrder('Normal'), 3);
  assert.equal(controller.addOrder('VIP'), 4);
  assert.deepEqual(controller.status().pending.map(order => order.id), [2, 4, 1, 3]);
  assert.throws(() => controller.addOrder('Other'), /Order type/);
});

test('one bot cooks one order for 10 seconds, continues, then becomes idle', () => {
  const { controller, advance, events } = fixture();
  controller.addOrder('Normal');
  controller.addOrder('VIP');
  controller.addBot();
  assert.deepEqual(controller.status().processing.map(item => item.orderId), [2]);
  advance(9_999);
  assert.equal(controller.status().complete.length, 0);
  advance(1);
  assert.deepEqual(controller.status().complete.map(order => order.id), [2]);
  assert.deepEqual(controller.status().processing.map(item => item.orderId), [1]);
  advance(10_000);
  assert.deepEqual(controller.status().complete.map(order => order.id), [2, 1]);
  assert.deepEqual(controller.status().bots, [{ id: 1, status: 'IDLE' }]);
  assert.match(events.find(line => line.includes('completed VIP')), /^\[12:00:10\].*10 seconds/);
  controller.addOrder('VIP');
  assert.deepEqual(controller.status().processing.map(item => item.orderId), [3]);
});

test('removing newest busy bot cancels cooking and restores original queue position', () => {
  const { controller, advance } = fixture();
  controller.addOrder('Normal'); // #1
  controller.addOrder('VIP'); // #2
  controller.addOrder('Normal'); // #3
  controller.addOrder('VIP'); // #4
  controller.addBot(); // #2
  controller.addBot(); // #4
  advance(5_000);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(controller.status().pending.map(order => order.id), [4, 1, 3]);
  controller.addOrder('VIP'); // #5 queues after returned #4
  assert.deepEqual(controller.status().pending.map(order => order.id), [4, 5, 1, 3]);
  advance(5_000);
  assert.deepEqual(controller.status().complete.map(order => order.id), [2]);
  assert.deepEqual(controller.status().processing.map(item => item.orderId), [4]);
  assert.equal(controller.status().complete.some(order => order.id === 4), false);
  advance(10_000);
  assert.deepEqual(controller.status().complete.map(order => order.id), [2, 4]);
});

test('an interrupted order starts a fresh 10 seconds when another bot takes it', () => {
  const { controller, advance } = fixture();
  controller.addOrder('Normal');
  controller.addBot();
  advance(8_000);
  controller.removeBot();
  assert.deepEqual(controller.status().pending.map(order => order.id), [1]);
  advance(2_000);
  controller.addBot();
  advance(9_999);
  assert.equal(controller.status().complete.length, 0);
  advance(1);
  assert.deepEqual(controller.status().complete.map(order => order.id), [1]);
});

test('two bots work independently and removing an idle bot leaves work running', () => {
  const { controller, advance } = fixture();
  controller.addOrder('Normal');
  controller.addOrder('Normal');
  controller.addBot();
  controller.addBot();
  assert.deepEqual(controller.status().processing.map(item => item.orderId), [1, 2]);
  advance(10_000);
  assert.deepEqual(controller.status().complete.map(order => order.id), [1, 2]);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(controller.status().bots, [{ id: 1, status: 'IDLE' }]);
  assert.equal(controller.removeBot(), 1);
  assert.equal(controller.removeBot(), null);
});
