'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OrderController, PROCESSING_MS } = require('../src/order-controller');

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimer(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delay, callback });
    return id;
  }

  clearTimer(id) {
    this.tasks.delete(id);
  }

  advance(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      const due = [...this.tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due || due[1].at > end) break;
      this.now = due[1].at;
      this.tasks.delete(due[0]);
      due[1].callback();
    }
    this.now = end;
  }
}

function setup() {
  const time = new FakeClock();
  const events = [];
  const controller = new OrderController({
    clock: () => new Date(time.now),
    setTimer: time.setTimer.bind(time),
    clearTimer: time.clearTimer.bind(time),
    onEvent: (event) => events.push(event)
  });
  return { controller, time, events };
}

const ids = (items) => items.map(({ id }) => id);

test('VIP orders lead pending queue in FIFO order; order IDs always increase', () => {
  const { controller } = setup();
  assert.equal(controller.addOrder('NORMAL'), 1);
  assert.equal(controller.addOrder('VIP'), 2);
  assert.equal(controller.addOrder('NORMAL'), 3);
  assert.equal(controller.addOrder('VIP'), 4);
  assert.deepEqual(ids(controller.getState().pending), [2, 4, 1, 3]);
  assert.throws(() => controller.addOrder('UNKNOWN'), /Order type/);
  assert.equal(controller.addOrder('NORMAL'), 5);
});

test('each bot works on one order for exactly ten seconds, then takes the next', () => {
  const { controller, time, events } = setup();
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  controller.addBot();
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [2]);
  time.advance(PROCESSING_MS - 1);
  assert.deepEqual(ids(controller.getState().complete), []);
  time.advance(1);
  assert.deepEqual(ids(controller.getState().complete), [2]);
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [1]);
  assert.equal(events.find((event) => event.message.includes('completed')).at.getTime(), PROCESSING_MS);
  time.advance(PROCESSING_MS * 2);
  assert.deepEqual(ids(controller.getState().complete), [2, 1, 3]);
  assert.deepEqual(controller.getState().bots, [{ id: 1, status: 'IDLE' }]);
  controller.addOrder('VIP');
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [4]);
});

test('newest busy bot is removed; its order resumes from its original priority position', () => {
  const { controller, time } = setup();
  controller.addOrder('VIP'); // #1, taken by bot #1
  controller.addBot();
  controller.addOrder('NORMAL'); // #2, taken by bot #2
  controller.addBot();
  controller.addOrder('NORMAL'); // #3, waiting
  controller.addOrder('VIP'); // #4, waiting ahead of normals
  time.advance(4_000);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.getState().pending), [4, 2, 3]);
  time.advance(6_000);
  assert.deepEqual(ids(controller.getState().complete), [1]);
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [4]);
  time.advance(10_000);
  assert.deepEqual(ids(controller.getState().complete), [1, 4]);
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [2]);
  assert.deepEqual(controller.getState().bots, [{ id: 1, status: 'BUSY' }]);
});

test('adding a bot starts pending work immediately; idle and empty removal are safe', () => {
  const { controller, time } = setup();
  assert.equal(controller.removeBot(), null);
  controller.addBot();
  assert.deepEqual(controller.getState().bots, [{ id: 1, status: 'IDLE' }]);
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addBot();
  assert.deepEqual(controller.getState().processing.map(({ orderId }) => orderId), [1, 2]);
  time.advance(PROCESSING_MS);
  assert.deepEqual(ids(controller.getState().complete), [1, 2]);
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(controller.getState().bots, [{ id: 1, status: 'IDLE' }]);
});

test('cancelled work never completes on the old timer and gets a full new ten seconds', () => {
  const { controller, time } = setup();
  controller.addOrder('NORMAL');
  controller.addBot();
  time.advance(9_000);
  controller.removeBot();
  assert.deepEqual(ids(controller.getState().pending), [1]);
  time.advance(1_000);
  assert.deepEqual(ids(controller.getState().complete), []);
  controller.addBot();
  time.advance(9_999);
  assert.deepEqual(ids(controller.getState().complete), []);
  time.advance(1);
  assert.deepEqual(ids(controller.getState().complete), [1]);
});

test('a cancelled VIP order returns ahead of later VIP orders and all normal orders', () => {
  const { controller } = setup();
  controller.addOrder('NORMAL'); // #1
  controller.addOrder('VIP'); // #2
  controller.addBot(); // Bot #1 takes #2
  controller.addOrder('VIP'); // #3
  controller.removeBot();
  assert.deepEqual(ids(controller.getState().pending), [2, 3, 1]);
});
