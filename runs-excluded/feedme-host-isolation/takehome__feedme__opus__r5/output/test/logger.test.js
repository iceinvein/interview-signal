'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, createLogger } = require('../src/logger');

it('formats time as zero-padded HH:MM:SS', () => {
  assert.equal(formatTime(new Date(2024, 0, 1, 7, 5, 9)), '07:05:09');
  assert.equal(formatTime(new Date(2024, 0, 1, 23, 59, 0)), '23:59:00');
});

it('prefixes every line with a timestamp and writes to all sinks', () => {
  const a = [];
  const b = [];
  const log = createLogger([(l) => a.push(l), (l) => b.push(l)], () => new Date(2024, 0, 1, 14, 32, 1));
  log('hello');
  assert.deepEqual(a, ['[14:32:01] hello']);
  assert.deepEqual(b, a);
});
