import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderController } from '../src/order-controller.js';

class FakeClock {
  time = Date.UTC(2026, 0, 1, 12, 0, 0);
  nextId = 1;
  timers = new Map();
  now = () => this.time;
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.time + delay });
    return id;
  };
  clearTimeout = (id) => this.timers.delete(id);

  advance(milliseconds) {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
}

const ids = (orders) => orders.map((order) => order.id);

test('VIP orders queue before normal orders, FIFO within each class, with increasing IDs', () => {
  const controller = new OrderController();
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  assert.deepEqual(ids(controller.status().pending), [2, 4, 1, 3]);
  assert.throws(() => controller.addOrder('OTHER'), /Order type/);
});

test('one bot finishes exactly after 10 seconds, takes the next order, then idles', () => {
  const clock = new FakeClock();
  const events = [];
  const controller = new OrderController({ clock, onEvent: (event) => events.push(event) });
  const first = controller.addOrder('NORMAL');
  const second = controller.addOrder('NORMAL');
  controller.addBot();
  assert.equal(first.status, 'PROCESSING');
  assert.equal(second.status, 'PENDING');
  clock.advance(9_999);
  assert.deepEqual(ids(controller.status().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.status().complete), [1]);
  assert.equal(second.status, 'PROCESSING');
  assert.equal(events.find((event) => event.message.includes('completed')).timestamp, '12:00:10');
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [1, 2]);
  assert.deepEqual(controller.status().bots, [{ id: 1, status: 'IDLE' }]);
  controller.addOrder('VIP');
  assert.equal(controller.status().processing[0].orderId, 3);
});

test('removing newest processing bot restores original queue position and cancels its timer', () => {
  const clock = new FakeClock();
  const controller = new OrderController({ clock });
  const normal = controller.addOrder('NORMAL');
  const vip = controller.addOrder('VIP');
  controller.addBot(); // VIP #2
  controller.addBot(); // Normal #1
  controller.addOrder('VIP'); // VIP #3
  clock.advance(5_000);
  const removed = controller.removeBot();
  assert.equal(removed.id, 2);
  assert.equal(normal.status, 'PENDING');
  assert.deepEqual(ids(controller.status().pending), [3, 1]);
  clock.advance(5_000);
  assert.deepEqual(ids(controller.status().complete), [2]);
  assert.equal(vip.status, 'COMPLETE');
  assert.deepEqual(ids(controller.status().pending), [1]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [2, 3]);
  assert.equal(normal.status, 'PROCESSING');
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [2, 3, 1]);
});

test('removing an idle bot and removing from an empty system are safe', () => {
  const controller = new OrderController();
  controller.addBot();
  controller.addBot();
  assert.equal(controller.removeBot().id, 2);
  assert.equal(controller.removeBot().id, 1);
  assert.equal(controller.removeBot(), null);
  assert.deepEqual(controller.status().bots, []);
});

test('interrupted order gets a fresh 10 seconds on another bot', () => {
  const clock = new FakeClock();
  const controller = new OrderController({ clock });
  controller.addOrder('NORMAL');
  controller.addBot();
  clock.advance(8_000);
  controller.removeBot();
  controller.addBot();
  clock.advance(2_000);
  assert.deepEqual(ids(controller.status().complete), []);
  clock.advance(8_000);
  assert.deepEqual(ids(controller.status().complete), [1]);
});

test('interrupted VIP returns ahead of later VIP orders and all normal orders', () => {
  const controller = new OrderController();
  controller.addOrder('NORMAL'); // #1
  controller.addOrder('VIP'); // #2
  controller.addBot(); // Picks up #2
  controller.addOrder('VIP'); // #3
  controller.addOrder('NORMAL'); // #4
  controller.removeBot();
  assert.deepEqual(ids(controller.status().pending), [2, 3, 1, 4]);
});
