'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, PassThrough } = require('node:stream');
const { main, formatTime } = require('../src/cli');

async function runCli(commands) {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => (text += chunk));
  await main({ input: Readable.from([commands.join('\n')]), output });
  return text;
}

describe('CLI', () => {
  it('formats time as HH:MM:SS', () => {
    assert.equal(formatTime(new Date(2024, 0, 1, 9, 5, 7)), '09:05:07');
  });

  it('runs piped commands and prints timestamped events', async () => {
    const text = await runCli(['normal', 'vip', '+', 'status', 'quit']);
    assert.match(text, /\[\d{2}:\d{2}:\d{2}\] Created Normal Order #1001 - Status: PENDING/);
    assert.match(text, /\[\d{2}:\d{2}:\d{2}\] Bot #1 picked up VIP Order #1002/);
    assert.match(text, /PENDING: {4}Normal #1001/);
    assert.match(text, /Pending Orders: 1/);
  });

  it('reports unknown commands', async () => {
    const text = await runCli(['bogus']);
    assert.match(text, /Unknown command: "bogus"/);
  });
});
