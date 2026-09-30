import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderController } from '../src/order-controller.js';
import { ManualClock } from '../src/manual-clock.js';

function setup() {
  const clock = new ManualClock();
  const events = [];
  const controller = new OrderController({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent: (event) => events.push(event),
  });
  return { controller, clock, events };
}

const ids = (orders) => orders.map((order) => order.id);

test('order IDs increase and pending orders keep VIP FIFO priority', () => {
  const { controller } = setup();
  assert.deepEqual([
    controller.addOrder('NORMAL'), controller.addOrder('VIP'),
    controller.addOrder('NORMAL'), controller.addOrder('VIP'),
  ], [1, 2, 3, 4]);
  assert.deepEqual(ids(controller.snapshot().pending), [2, 4, 1, 3]);
  assert.throws(() => controller.addOrder('OTHER'), /Order type/);
});

test('one bot processes one order for exactly 10 seconds, then takes the next', () => {
  const { controller, clock, events } = setup();
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  controller.addBot();
  assert.deepEqual(ids(controller.snapshot().pending), [2]);
  assert.deepEqual(ids(controller.snapshot().processing.map(({ order }) => order)), [1]);
  clock.advance(9_999);
  assert.deepEqual(ids(controller.snapshot().complete), []);
  clock.advance(1);
  assert.deepEqual(ids(controller.snapshot().complete), [1]);
  assert.deepEqual(ids(controller.snapshot().processing.map(({ order }) => order)), [2]);
  assert.equal(events.find((event) => event.message.includes('completed')).timestamp -
    events.find((event) => event.message.includes('picked up')).timestamp, 10_000);
  clock.advance(10_000);
  assert.deepEqual(ids(controller.snapshot().complete), [1, 2]);
  assert.deepEqual(controller.snapshot().bots, [{ id: 1, status: 'IDLE' }]);
  controller.addOrder('VIP');
  assert.deepEqual(ids(controller.snapshot().processing.map(({ order }) => order)), [3]);
});

test('multiple bots work concurrently and a new bot starts immediately', () => {
  const { controller, clock } = setup();
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addBot();
  clock.advance(2_000);
  controller.addBot();
  assert.deepEqual(controller.snapshot().processing.map(({ botId, order }) => [botId, order.id]),
    [[1, 2], [2, 1]]);
  clock.advance(8_000);
  assert.deepEqual(ids(controller.snapshot().complete), [2]);
  clock.advance(2_000);
  assert.deepEqual(ids(controller.snapshot().complete), [2, 1]);
});

test('removing newest busy bot cancels work and restores original queue position', () => {
  const { controller, clock } = setup();
  controller.addOrder('NORMAL'); // #1
  controller.addOrder('VIP');    // #2
  controller.addBot();           // Takes #2
  controller.addBot();           // Takes #1 (newest bot)
  clock.advance(4_000);
  controller.addOrder('NORMAL'); // #3
  controller.addOrder('VIP');    // #4
  assert.equal(controller.removeBot(), 2);
  assert.deepEqual(ids(controller.snapshot().pending), [4, 1, 3]);
  assert.deepEqual(controller.snapshot().bots, [{ id: 1, status: 'BUSY' }]);
  clock.advance(6_000);         // #2 finishes; #4 starts
  assert.deepEqual(ids(controller.snapshot().complete), [2]);
  assert.deepEqual(ids(controller.snapshot().pending), [1, 3]);
  clock.advance(4_000);         // Removed bot's original deadline
  assert.deepEqual(ids(controller.snapshot().complete), [2]);
  clock.advance(26_000);
  assert.deepEqual(ids(controller.snapshot().complete), [2, 4, 1, 3]);
  assert.deepEqual(ids(controller.snapshot().pending), []);
});

test('returned VIP joins ahead of normal orders and behind earlier VIP orders', () => {
  const { controller } = setup();
  controller.addOrder('VIP');    // #1
  controller.addOrder('VIP');    // #2
  controller.addBot();           // #1
  controller.addBot();           // #2, newest bot
  controller.addOrder('NORMAL'); // #3
  controller.addOrder('VIP');    // #4
  controller.removeBot();
  assert.deepEqual(ids(controller.snapshot().pending), [2, 4, 3]);
});

test('removing an idle bot or an empty bot list is safe', () => {
  const { controller } = setup();
  assert.equal(controller.removeBot(), null);
  assert.equal(controller.addBot(), 1);
  assert.equal(controller.removeBot(), 1);
  assert.deepEqual(controller.snapshot().bots, []);
});
