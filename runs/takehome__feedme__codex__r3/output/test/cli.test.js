'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('interactive CLI accepts commands and timestamps each output line', () => {
  const result = spawnSync(process.execPath, ['src/cli.js'], {
    cwd: path.join(__dirname, '..'),
    input: 'normal\nvip\nstatus\n+ bot\n- bot\nstatus\nquit\n',
    encoding: 'utf8',
    timeout: 5_000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PENDING: #2 VIP, #1 NORMAL/);
  assert.match(result.stdout, /picked up VIP Order #2 - PROCESSING/);
  assert.match(result.stdout, /stopped VIP Order #2 - returned to PENDING/);
  assert.equal(result.stdout.trimEnd().split('\n').every((line) => /^\[\d{2}:\d{2}:\d{2}\] /.test(line)), true);
});
