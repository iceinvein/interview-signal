import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('interactive CLI handles commands and exposes pending, processing, and cancelled orders', () => {
  const run = spawnSync(process.execPath, ['src/cli.js'], {
    input: 'normal\nvip\n+ bot\nstatus\n- bot\nstatus\nexit\n',
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const statuses = run.stdout.split('\n')
    .filter((line) => line.includes('] {'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))));
  assert.deepEqual(statuses.map((state) => state.pending.map((order) => order.id)), [[1], [2, 1]]);
  assert.deepEqual(statuses[0].processing.map((order) => order.id), [2]);
  assert.deepEqual(statuses[1].processing, []);
  for (const line of run.stdout.trim().split('\n')) {
    assert.match(line, /^\[\d{2}:\d{2}:\d{2}\]/);
  }
});
