'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { OrderController } = require('../src/orderController');
const { timestamp } = require('../src/cli');

// Manual fake timers: advance(ms) fires due callbacks in order.
function makeClock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

const setup = () => {
  const clock = makeClock();
  return { clock, c: new OrderController({ setTimer: clock.setTimer, clearTimer: clock.clearTimer }) };
};
const ids = (list) => list.map((o) => o.id);

test('normal order goes to PENDING', () => {
  const { c } = setup();
  c.addOrder('NORMAL');
  assert.deepStrictEqual(ids(c.status().pending), [1]);
});

test('order numbers are unique and increasing', () => {
  const { c } = setup();
  const got = [c.addOrder('NORMAL'), c.addOrder('VIP'), c.addOrder('NORMAL')].map((o) => o.id);
  assert.deepStrictEqual(got, [1, 2, 3]);
});

test('VIP goes ahead of normal but behind existing VIP', () => {
  const { c } = setup();
  c.addOrder('NORMAL'); c.addOrder('VIP'); c.addOrder('NORMAL'); c.addOrder('VIP');
  assert.deepStrictEqual(ids(c.status().pending), [2, 4, 1, 3]);
});

test('bot completes order after 10s and moves it to COMPLETE', () => {
  const { c, clock } = setup();
  c.addOrder('NORMAL');
  c.addBot();
  clock.advance(9999);
  assert.strictEqual(c.status().complete.length, 0);
  clock.advance(1);
  assert.deepStrictEqual(ids(c.status().complete), [1]);
});

test('bot picks up next order, then goes IDLE', () => {
  const { c, clock } = setup();
  c.addOrder('NORMAL'); c.addOrder('NORMAL');
  c.addBot();
  clock.advance(10000);
  assert.deepStrictEqual(ids(c.status().pending), []);
  assert.strictEqual(c.status().processing[0].id, 2);
  clock.advance(10000);
  assert.strictEqual(c.status().bots[0].state, 'IDLE');
});

test('idle bot picks up new order immediately', () => {
  const { c } = setup();
  c.addBot();
  c.addOrder('VIP');
  assert.strictEqual(c.status().processing[0].id, 1);
});

test('adding a bot processes pending orders immediately, VIP first', () => {
  const { c } = setup();
  c.addOrder('NORMAL'); c.addOrder('VIP');
  c.addBot();
  assert.strictEqual(c.status().processing[0].id, 2);
});

test('bot handles only one order at a time', () => {
  const { c } = setup();
  c.addOrder('NORMAL'); c.addOrder('NORMAL');
  c.addBot();
  assert.strictEqual(c.status().processing.length, 1);
  assert.deepStrictEqual(ids(c.status().pending), [2]);
});

test('removing a bot returns its order to original position and stops processing', () => {
  const { c, clock } = setup();
  c.addOrder('NORMAL'); c.addOrder('NORMAL'); c.addOrder('NORMAL');
  c.addBot();            // takes #1
  c.addBot();            // takes #2
  c.removeBot();         // newest (bot 2) destroyed, #2 returns
  assert.deepStrictEqual(ids(c.status().pending), [2, 3]);
  clock.advance(10000);
  assert.deepStrictEqual(ids(c.status().complete), [1]); // #2 not completed by destroyed bot
});

test('returned VIP order keeps priority over normal orders', () => {
  const { c } = setup();
  c.addBot();
  c.addOrder('VIP');     // bot takes #1
  c.addOrder('NORMAL');
  c.addOrder('VIP');
  c.removeBot();
  assert.deepStrictEqual(ids(c.status().pending), [1, 3, 2]);
});

test('removing the newest bot leaves older bots working', () => {
  const { c } = setup();
  c.addOrder('NORMAL'); c.addOrder('NORMAL');
  c.addBot(); c.addBot();
  c.removeBot();
  assert.deepStrictEqual(c.status().bots, [{ id: 1, state: 'PROCESSING' }]);
});

test('removeBot with no bots returns null', () => {
  const { c } = setup();
  assert.strictEqual(c.removeBot(), null);
});

test('unknown order type is rejected', () => {
  const { c } = setup();
  assert.throws(() => c.addOrder('X'));
});

test('timestamp is HH:MM:SS', () => {
  assert.match(timestamp(), /^\d{2}:\d{2}:\d{2}$/);
});
