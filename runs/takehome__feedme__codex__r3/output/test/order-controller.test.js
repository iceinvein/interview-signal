'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OrderController, PROCESSING_MS } = require('../src/order-controller');

function makeHarness() {
  let time = Date.UTC(2026, 0, 1);
  let nextTimerId = 1;
  const timers = new Map();
  const events = [];
  const controller = new OrderController({
    now: () => time,
    setTimer: (callback, delay) => {
      const id = nextTimerId++;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    onEvent: (event) => events.push(event)
  });

  function advance(milliseconds) {
    const end = time + milliseconds;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  }

  return { controller, events, advance, timers };
}

const ids = (orders) => orders.map((order) => order.id);

test('orders receive increasing IDs and waiting orders keep VIP FIFO priority', () => {
  const { controller } = makeHarness();
  assert.equal(controller.addOrder('NORMAL'), 1);
  assert.equal(controller.addOrder('VIP'), 2);
  assert.equal(controller.addOrder('NORMAL'), 3);
  assert.equal(controller.addOrder('VIP'), 4);
  assert.deepEqual(ids(controller.getState().pending), [2, 4, 1, 3]);
  assert.deepEqual(controller.getState().pending.map(({ status }) => status), Array(4).fill('PENDING'));
  assert.throws(() => controller.addOrder('OTHER'), /Order type/);
});

test('a bot completes only after ten seconds and immediately starts the next order', () => {
  const { controller, advance, events } = makeHarness();
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addBot();
  assert.deepEqual(ids(controller.getState().processing.map(({ order }) => order)), [2]);
  advance(PROCESSING_MS - 1);
  assert.deepEqual(ids(controller.getState().complete), []);
  advance(1);
  assert.deepEqual(ids(controller.getState().complete), [2]);
  assert.deepEqual(ids(controller.getState().processing.map(({ order }) => order)), [1]);
  advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.getState().complete), [2, 1]);
  assert.deepEqual(controller.getState().bots.map(({ status }) => status), ['IDLE']);
  assert.equal(events.filter(({ type }) => type === 'completed').length, 2);
  assert.equal(events.find(({ type }) => type === 'completed').at - events.find(({ type }) => type === 'started').at, PROCESSING_MS);
});

test('idle bots pick up new orders immediately and each handles only one order', () => {
  const { controller, advance } = makeHarness();
  controller.addBot();
  controller.addBot();
  assert.deepEqual(controller.getState().bots.map(({ status }) => status), ['IDLE', 'IDLE']);
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  assert.deepEqual(controller.getState().processing.map(({ botId, order }) => [botId, order.id]), [[1, 1], [2, 2]]);
  assert.deepEqual(ids(controller.getState().pending), [3]);
  advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.getState().complete), [1, 2]);
  assert.deepEqual(controller.getState().processing.map(({ order }) => order.id), [3]);
});

test('removing the newest busy bot cancels work and restores its original queue position', () => {
  const { controller, advance, events, timers } = makeHarness();
  controller.addOrder('NORMAL'); // #1
  controller.addOrder('NORMAL'); // #2
  controller.addOrder('VIP');    // #3
  controller.addBot();           // #3 starts on Bot #1
  controller.addBot();           // #1 starts on Bot #2
  controller.addOrder('VIP');    // #4 waits after active VIP #3
  advance(4_000);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.getState().pending), [4, 1, 2]);
  assert.deepEqual(controller.getState().bots.map(({ id }) => id), [1]);
  assert.equal(timers.size, 1);
  advance(6_000);
  assert.deepEqual(ids(controller.getState().complete), [3]);
  assert.equal(events.some(({ type, message }) => type === 'completed' && message.includes('Order #1')), false);
  assert.deepEqual(controller.getState().processing.map(({ order }) => order.id), [4]);
  controller.addBot();
  assert.deepEqual(controller.getState().processing.map(({ order }) => order.id), [4, 1]);
  advance(PROCESSING_MS - 1);
  assert.deepEqual(ids(controller.getState().complete), [3]);
  advance(1);
  assert.deepEqual(ids(controller.getState().complete), [3, 4, 1]);
});

test('interrupted VIP order returns ahead of later VIPs and restarts its full timer', () => {
  const { controller, advance } = makeHarness();
  controller.addOrder('VIP');
  controller.addBot();
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  advance(9_000);
  controller.removeBot();
  assert.deepEqual(ids(controller.getState().pending), [1, 2, 3]);
  controller.addBot();
  advance(1_000);
  assert.deepEqual(ids(controller.getState().complete), []);
  advance(9_000);
  assert.deepEqual(ids(controller.getState().complete), [1]);
});

test('removing an idle bot and removing from an empty pool are safe', () => {
  const { controller } = makeHarness();
  assert.equal(controller.removeBot(), null);
  assert.equal(controller.addBot(), 1);
  assert.equal(controller.removeBot(), 1);
  assert.equal(controller.removeBot(), null);
  assert.deepEqual(controller.getState().bots, []);
});
