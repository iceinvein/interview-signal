import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderController } from '../src/order-controller.js';
import { FakeClock } from '../src/fake-clock.js';

function setup() {
  const clock = new FakeClock();
  const lines = [];
  const controller = new OrderController({ clock, log: (line) => lines.push(line) });
  return { clock, lines, controller };
}

const ids = (orders) => orders.map((order) => order.id);

test('orders have increasing IDs and VIP orders queue before normal orders, FIFO within each group', () => {
  const { controller } = setup();
  assert.equal(controller.newOrder('Normal'), 1);
  assert.equal(controller.newOrder('VIP'), 2);
  assert.equal(controller.newOrder('Normal'), 3);
  assert.equal(controller.newOrder('VIP'), 4);
  assert.deepEqual(ids(controller.status().pending), [2, 4, 1, 3]);
  assert.throws(() => controller.newOrder('Other'), /Order type/);
  assert.deepEqual(ids(controller.status().pending), [2, 4, 1, 3]);
});

test('a bot completes each order after exactly ten seconds and takes the next order', () => {
  const { controller, clock, lines } = setup();
  controller.newOrder('Normal');
  controller.newOrder('VIP');
  controller.addBot();
  assert.deepEqual(ids(controller.status().processing), [2]);
  assert.deepEqual(ids(controller.status().pending), [1]);

  clock.advance(9_999);
  assert.deepEqual(ids(controller.status().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.status().complete), [2]);
  assert.deepEqual(ids(controller.status().processing), [1]);
  assert.match(lines.find((line) => line.includes('completed VIP')), /^\[12:00:10\]/);

  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [2, 1]);
  assert.equal(controller.status().bots[0].status, 'IDLE');
  controller.newOrder('VIP');
  assert.deepEqual(ids(controller.status().processing), [3]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [2, 1, 3]);
});

test('new bots start available orders immediately and process at most one each', () => {
  const { controller, clock } = setup();
  controller.newOrder('Normal');
  controller.newOrder('Normal');
  controller.newOrder('Normal');
  assert.equal(controller.addBot(), 1);
  assert.equal(controller.addBot(), 2);
  assert.deepEqual(ids(controller.status().processing), [1, 2]);
  assert.deepEqual(ids(controller.status().pending), [3]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [1, 2]);
  assert.deepEqual(ids(controller.status().processing), [3]);
  assert.equal(controller.status().bots[1].status, 'IDLE');
});

test('removing the newest bot cancels cooking and restores its order to its original priority position', () => {
  const { controller, clock } = setup();
  controller.newOrder('Normal'); // #1
  controller.newOrder('VIP');    // #2
  controller.newOrder('Normal'); // #3
  controller.addBot();          // #2
  controller.addBot();          // #1
  controller.newOrder('VIP');   // #4
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.status().pending), [4, 1, 3]);
  assert.deepEqual(ids(controller.status().processing), [2]);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.status().complete), [2]);
  assert.deepEqual(ids(controller.status().processing), [4]);
  clock.advance(30_000);
  assert.deepEqual(ids(controller.status().complete), [2, 4, 1, 3]);
  assert.equal(controller.status().bots.length, 1);
});

test('a cancelled order never completes on its old timer; a new pickup takes a full ten seconds', () => {
  const { controller, clock } = setup();
  controller.newOrder('Normal');
  controller.addBot();
  clock.advance(9_000);
  controller.removeBot();
  assert.deepEqual(ids(controller.status().pending), [1]);
  assert.deepEqual(ids(controller.status().complete), []);
  clock.advance(1_000);
  assert.deepEqual(ids(controller.status().complete), []);
  controller.addBot();
  clock.advance(9_999);
  assert.deepEqual(ids(controller.status().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.status().complete), [1]);
  assert.equal(controller.removeBot(), 2);
  assert.equal(controller.removeBot(), null);
});
