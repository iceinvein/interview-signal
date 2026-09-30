'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OrderController } = require('../src/order-controller');

class FakeClock {
  constructor() {
    this.time = Date.UTC(2026, 0, 1);
    this.nextTimerId = 1;
    this.timers = new Map();
  }

  now = () => new Date(this.time);

  setTimeout = (callback, delay) => {
    const id = this.nextTimerId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };

  clearTimeout = (id) => this.timers.delete(id);

  advance(ms) {
    const target = this.time + ms;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
}

function setup() {
  const clock = new FakeClock();
  const events = [];
  const controller = new OrderController({ clock, onEvent: (event) => events.push(event) });
  return { clock, events, controller };
}

function ids(orders) {
  return orders.map((order) => order.id);
}

test('VIP orders lead pending queue; both classes keep their original order', () => {
  const { controller } = setup();
  controller.newOrder('NORMAL'); // 1
  controller.newOrder('VIP');    // 2
  controller.newOrder('NORMAL'); // 3
  controller.newOrder('VIP');    // 4
  assert.deepEqual(ids(controller.getStatus().pending), [2, 4, 1, 3]);
  assert.deepEqual(controller.getStatus().pending.map((order) => order.status), Array(4).fill('PENDING'));
  assert.equal(controller.newOrder('NORMAL').id, 5);
  assert.throws(() => controller.newOrder('OTHER'), /Order type/);
});

test('a bot starts immediately, takes exactly 10 seconds, then picks the next order', () => {
  const { controller, clock, events } = setup();
  controller.newOrder('VIP');
  controller.newOrder('NORMAL');
  controller.addBot();
  assert.deepEqual(ids(controller.getStatus().processing.map((item) => item.order)), [1]);
  clock.advance(9_999);
  assert.deepEqual(ids(controller.getStatus().completed), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.getStatus().completed), [1]);
  assert.deepEqual(ids(controller.getStatus().processing.map((item) => item.order)), [2]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.getStatus().completed), [1, 2]);
  assert.equal(controller.getStatus().bots[0].status, 'IDLE');
  assert.equal(events.filter((event) => event.message.includes(' - COMPLETE')).length, 2);
});

test('multiple bots process one order each and an idle bot starts on arrival', () => {
  const { controller, clock } = setup();
  controller.addBot();
  controller.addBot();
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.status), ['IDLE', 'IDLE']);
  controller.newOrder('NORMAL');
  controller.newOrder('VIP');
  assert.deepEqual(controller.getStatus().processing.map((item) => [item.botId, item.order.id]), [[1, 1], [2, 2]]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.getStatus().completed), [1, 2]);
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.status), ['IDLE', 'IDLE']);
});

test('removing newest busy bot cancels its timer and restores order to FIFO position', () => {
  const { controller, clock } = setup();
  controller.newOrder('NORMAL'); // 1
  controller.newOrder('NORMAL'); // 2
  controller.newOrder('VIP');    // 3
  controller.newOrder('VIP');    // 4
  controller.addBot(); // #1 handles VIP 3
  controller.addBot(); // #2 handles VIP 4
  controller.addBot(); // #3 handles normal 1
  controller.removeBot();
  assert.deepEqual(controller.getStatus().bots.map((bot) => bot.id), [1, 2]);
  assert.deepEqual(ids(controller.getStatus().pending), [1, 2]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.getStatus().completed), [3, 4]);
  assert.deepEqual(ids(controller.getStatus().processing.map((item) => item.order)), [1, 2]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.getStatus().completed), [3, 4, 1, 2]);
  assert.equal(controller.getStatus().completed.filter((order) => order.id === 1).length, 1);
});

test('cancelled VIP returns ahead of normals and behind earlier VIP orders', () => {
  const { controller } = setup();
  controller.newOrder('VIP');    // 1
  controller.newOrder('VIP');    // 2
  controller.newOrder('NORMAL'); // 3
  controller.addBot(); // #1 handles VIP 1
  controller.addBot(); // #2 handles VIP 2
  controller.newOrder('VIP'); // 4
  controller.removeBot();
  assert.deepEqual(ids(controller.getStatus().pending), [2, 4, 3]);
});

test('a cancelled order needs a fresh 10 seconds when another bot picks it up', () => {
  const { controller, clock } = setup();
  controller.newOrder('NORMAL');
  controller.addBot();
  clock.advance(9_000);
  controller.removeBot();
  assert.deepEqual(ids(controller.getStatus().pending), [1]);
  controller.addBot();
  clock.advance(1_000);
  assert.deepEqual(ids(controller.getStatus().completed), []);
  clock.advance(9_000);
  assert.deepEqual(ids(controller.getStatus().completed), [1]);
});

test('removing an idle bot and removing from an empty pool are safe', () => {
  const { controller } = setup();
  assert.equal(controller.removeBot(), null);
  assert.equal(controller.addBot(), 1);
  assert.equal(controller.removeBot(), 1);
  assert.deepEqual(controller.getStatus().bots, []);
});
