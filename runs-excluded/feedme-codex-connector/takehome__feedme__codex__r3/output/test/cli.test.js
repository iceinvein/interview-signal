'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('CLI accepts interactive commands from stdin and timestamps every output line', () => {
  const cli = path.join(__dirname, '..', 'src', 'cli.js');
  const result = spawnSync(process.execPath, [cli], {
    input: 'normal\nvip\nstatus\n+\n-\nstatus\nquit\n',
    encoding: 'utf8',
    timeout: 2_000
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.every(line => /^\[\d{2}:\d{2}:\d{2}\] /.test(line)));
  assert.ok(lines.some(line => line.includes('PENDING: VIP #1002, Normal #1001')));
  assert.ok(lines.some(line => line.includes('returned to PENDING')));
  assert.ok(lines.some(line => line.includes('Session ended')));
});
