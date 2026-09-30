'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('interactive CLI accepts commands and timestamps its output', () => {
  const cli = path.join(__dirname, '..', 'src', 'cli.js');
  const run = spawnSync(process.execPath, [cli], {
    input: 'normal\nvip\nstatus\n+ bot\nstatus\n- bot\nstatus\nexit\n',
    encoding: 'utf8',
    timeout: 5_000
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /PENDING: #2 \(VIP\), #1 \(Normal\)/);
  assert.match(run.stdout, /Bot #1 picked up VIP order #2/);
  assert.match(run.stdout, /returned to PENDING/);
  assert.match(run.stdout, /Goodbye/);
  for (const line of run.stdout.trim().split('\n')) {
    assert.match(line, /^\[\d{2}:\d{2}:\d{2}\]/, line);
  }
});
