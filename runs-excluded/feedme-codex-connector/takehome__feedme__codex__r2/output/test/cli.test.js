import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('demo prints timestamped completions and final status', () => {
  const run = spawnSync(process.execPath, ['src/cli.js', '--demo'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\[12:00:10\] Bot #1 completed VIP order #3/);
  assert.match(run.stdout, /\[12:00:40\] Bot #1 completed NORMAL order #2/);
  assert.match(run.stdout, /\[12:00:50\].*COMPLETE: VIP #3, VIP #4, NORMAL #1, NORMAL #2, NORMAL #5/);
  assert.ok(run.stdout.trim().split('\n').every((line) => /^\[\d{2}:\d{2}:\d{2}\]/.test(line)));
});

test('interactive CLI accepts order, bot, status, and quit commands', () => {
  const run = spawnSync(process.execPath, ['src/cli.js', '--interactive'], {
    input: 'normal\n+ bot\nstatus\n- bot\nstatus\nquit\n',
    encoding: 'utf8',
    timeout: 2_000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Created NORMAL order #1 - PENDING/);
  assert.match(run.stdout, /Bot #1 picked up NORMAL order #1 - PROCESSING/);
  assert.match(run.stdout, /Removed bot #1; NORMAL order #1 returned to PENDING/);
  assert.match(run.stdout, /PENDING: NORMAL #1 \| PROCESSING: none/);
});
