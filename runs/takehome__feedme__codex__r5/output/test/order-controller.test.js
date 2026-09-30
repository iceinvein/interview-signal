'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { OrderController } = require('../src/order-controller');

function harness() {
  let time = 0;
  let timerId = 0;
  const timers = new Map();
  const events = [];
  const controller = new OrderController({
    now: () => new Date(time),
    setTimer: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, due: time + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    onEvent: (event) => events.push(event),
  });
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      time = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  }
  return { controller, advance, events, timers };
}

test('VIP orders precede normal orders, with FIFO order within each type', () => {
  const { controller } = harness();
  for (const type of ['NORMAL', 'VIP', 'NORMAL', 'VIP', 'VIP']) {
    controller.addOrder(type);
  }
  assert.deepEqual(controller.snapshot().pending.map((order) => order.id), [2, 4, 5, 1, 3]);
  assert.equal(controller.addOrder('NORMAL'), 6);
});

test('an idle bot starts a newly arrived order immediately and completes it after 10 seconds', () => {
  const { controller, advance, events } = harness();
  controller.addBot();
  assert.equal(controller.snapshot().bots[0].status, 'IDLE');
  controller.addOrder('NORMAL');
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [1]);
  advance(9_999);
  assert.equal(controller.snapshot().complete.length, 0);
  advance(1);
  assert.deepEqual(controller.snapshot().complete.map((order) => order.id), [1]);
  assert.equal(controller.snapshot().complete[0].completedAt.getTime(), 10_000);
  assert.equal(controller.snapshot().bots[0].status, 'IDLE');
  assert.match(events.at(-2).message, /COMPLETE/);
});

test('a bot processes only one order at a time and then takes the next', () => {
  const { controller, advance } = harness();
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addBot();
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [1]);
  advance(10_000);
  assert.deepEqual(controller.snapshot().complete.map((order) => order.id), [1]);
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [2]);
  advance(10_000);
  assert.deepEqual(controller.snapshot().complete.map((order) => order.id), [1, 2]);
});

test('removing the newest busy bot cancels its timer and restores queue position', () => {
  const { controller, advance, timers } = harness();
  controller.addOrder('NORMAL'); // #1
  controller.addBot(); // bot #1 picks up #1
  controller.addOrder('NORMAL'); // #2
  controller.addBot(); // bot #2 picks up #2
  controller.addOrder('VIP'); // #3
  controller.addOrder('NORMAL'); // #4
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(controller.snapshot().pending.map((order) => order.id), [3, 2, 4]);
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [1]);
  assert.equal(timers.size, 1);
  advance(10_000);
  assert.deepEqual(controller.snapshot().complete.map((order) => order.id), [1]);
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [3]);
});

test('cancelled VIP order returns ahead of normal orders, behind earlier VIP orders', () => {
  const { controller } = harness();
  controller.addOrder('VIP'); // #1
  controller.addBot(); // newest bot picks up #1
  controller.addOrder('VIP'); // #2
  controller.addOrder('NORMAL'); // #3
  controller.removeBot();
  assert.deepEqual(controller.snapshot().pending.map((order) => order.id), [1, 2, 3]);
});

test('a stopped order needs a full new 10 seconds after another bot picks it up', () => {
  const { controller, advance } = harness();
  controller.addOrder('NORMAL');
  controller.addBot();
  advance(5_000);
  controller.removeBot();
  controller.addBot();
  advance(9_999);
  assert.equal(controller.snapshot().complete.length, 0);
  advance(1);
  assert.equal(controller.snapshot().complete[0].completedAt.getTime(), 15_000);
});

test('two bots process separate orders concurrently; removing an idle bot is safe', () => {
  const { controller, advance } = harness();
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addBot();
  controller.addBot();
  assert.deepEqual(controller.snapshot().processing.map((order) => order.id), [1, 2]);
  advance(10_000);
  assert.deepEqual(controller.snapshot().complete.map((order) => order.id), [1, 2]);
  assert.equal(controller.removeBot(), 2);
  assert.equal(controller.snapshot().pending.length, 0);
  assert.equal(controller.removeBot(), 1);
  assert.equal(controller.removeBot(), null);
});

test('interactive CLI accepts commands from standard input', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', '--interactive'], {
    cwd: process.cwd(),
    input: 'normal\nvip\nstatus\nquit\n',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PENDING: #2 VIP, #1 NORMAL/);
  assert.match(result.stdout, /\[\d{2}:\d{2}:\d{2}\]/);
});
