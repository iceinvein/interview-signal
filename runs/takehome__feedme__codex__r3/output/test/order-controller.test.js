'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, PROCESSING_MS } = require('../src/order-controller');

class FakeClock {
  constructor() {
    this.time = 0;
    this.nextId = 1;
    this.timers = new Map();
  }

  now = () => this.time;
  setTimer = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = id => this.timers.delete(id);

  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

function setup() {
  const clock = new FakeClock();
  const events = [];
  const controller = new OrderController({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent: event => events.push(event)
  });
  return { clock, controller, events };
}

const ids = orders => orders.map(order => order.number);

test('VIP priority and FIFO order are preserved; numbers increase across types', () => {
  const { controller } = setup();
  assert.equal(controller.newOrder('Normal'), 1001);
  assert.equal(controller.newOrder('VIP'), 1002);
  assert.equal(controller.newOrder('Normal'), 1003);
  assert.equal(controller.newOrder('VIP'), 1004);
  assert.deepEqual(ids(controller.snapshot().pending), [1002, 1004, 1001, 1003]);
  assert.equal(controller.addBot(), 1);
  assert.deepEqual(ids(controller.snapshot().pending), [1004, 1001, 1003]);
  assert.equal(controller.snapshot().processing[0].order.number, 1002);
});

test('a bot finishes after exactly ten seconds and immediately takes the next order', () => {
  const { clock, controller, events } = setup();
  controller.addBot();
  controller.newOrder('Normal');
  controller.newOrder('Normal');
  clock.advance(PROCESSING_MS - 1);
  assert.deepEqual(ids(controller.snapshot().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.snapshot().complete), [1001]);
  assert.equal(controller.snapshot().complete[0].completedAt, PROCESSING_MS);
  assert.equal(controller.snapshot().processing[0].order.number, 1002);
  clock.advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.snapshot().complete), [1001, 1002]);
  assert.equal(controller.snapshot().bots[0].status, 'IDLE');
  assert.ok(events.some(event => event.message.includes('is IDLE')));
  controller.newOrder('VIP');
  assert.equal(controller.snapshot().processing[0].order.number, 1003);
});

test('multiple bots each process one order and the newest bot is removed first', () => {
  const { clock, controller } = setup();
  controller.newOrder('Normal');
  controller.newOrder('Normal');
  controller.addBot();
  controller.addBot();
  assert.deepEqual(controller.snapshot().processing.map(item => item.order.number), [1001, 1002]);
  clock.advance(5_000);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.snapshot().pending), [1002]);
  assert.equal(controller.snapshot().processing[0].order.number, 1001);
  clock.advance(5_000);
  assert.deepEqual(ids(controller.snapshot().complete), [1001]);
  assert.equal(controller.snapshot().processing[0].order.number, 1002);
  clock.advance(9_999);
  assert.deepEqual(ids(controller.snapshot().complete), [1001]);
  clock.advance(1);
  assert.deepEqual(ids(controller.snapshot().complete), [1001, 1002]);
  assert.equal(controller.snapshot().complete[1].completedAt, 20_000);
});

test('interrupted orders return to their original position within their priority', () => {
  const { clock, controller } = setup();
  controller.newOrder('Normal'); // oldest normal will be interrupted
  controller.addBot();
  controller.newOrder('Normal');
  controller.newOrder('VIP');
  controller.newOrder('VIP');
  clock.advance(3_000);
  controller.removeBot();
  assert.deepEqual(ids(controller.snapshot().pending), [1003, 1004, 1001, 1002]);
  clock.advance(20_000);
  assert.deepEqual(ids(controller.snapshot().complete), []);
  assert.equal(controller.snapshot().pending[2].startedAt, null);
  assert.equal(controller.removeBot(), null);
});

test('adding a bot to pending work starts it immediately; idle removal is safe', () => {
  const { controller } = setup();
  controller.newOrder('VIP');
  controller.addBot();
  assert.equal(controller.snapshot().processing[0].order.number, 1001);
  controller.addBot();
  assert.equal(controller.snapshot().bots[1].status, 'IDLE');
  assert.equal(controller.removeBot(), 2);
  assert.equal(controller.snapshot().processing[0].order.number, 1001);
});
