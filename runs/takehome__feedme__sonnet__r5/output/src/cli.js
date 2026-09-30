#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const { OrderController } = require('./orderController');

const HELP = `Commands:
  normal   add a Normal order
  vip      add a VIP order
  +bot     add a bot
  -bot     remove the newest bot
  status   show PENDING / PROCESSING / COMPLETE and bots
  help     show this help
  exit     quit`;

const pad = (n) => String(n).padStart(2, '0');
const timestamp = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmt = (o) => `${o.type === 'VIP' ? 'V' : 'N'}#${o.id}`;

function formatStatus(s) {
  const list = (arr) => (arr.length ? arr.map(fmt).join(', ') : '-');
  return [
    `PENDING:    ${list(s.pending)}`,
    `PROCESSING: ${s.processing.length ? s.processing.map((o) => `${fmt(o)}(bot ${o.bot})`).join(', ') : '-'}`,
    `COMPLETE:   ${list(s.complete)}`,
    `BOTS:       ${s.bots.length ? s.bots.map((b) => `#${b.id} ${b.state}`).join(', ') : '-'}`,
  ].join('\n');
}

/** Returns a handler that executes one command line; output goes through `write`. */
function createSession(write) {
  const controller = new OrderController({ onEvent: (msg) => write(`[${timestamp()}] ${msg}`) });
  const handle = (line) => {
    switch (line.trim().toLowerCase()) {
      case 'normal': controller.addOrder('NORMAL'); break;
      case 'vip': controller.addOrder('VIP'); break;
      case '+bot': controller.addBot(); break;
      case '-bot': if (!controller.removeBot()) write(`[${timestamp()}] No bots to remove`); break;
      case 'status': write(`[${timestamp()}] Status\n${formatStatus(controller.status())}`); break;
      case 'help': write(HELP); break;
      case '': break;
      default: write(`Unknown command: ${line.trim()}. Type "help".`);
    }
  };
  return { controller, handle };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Non-interactive scenario covering every requirement; writes to the given file. */
async function runDemo(file) {
  const out = fs.createWriteStream(file);
  const write = (line) => { out.write(line + '\n'); console.log(line); };
  const { controller, handle } = createSession(write);
  write("McDonald's Order Controller - Simulation Results");
  const steps = [
    ['normal', 500], ['vip', 500], ['normal', 500], ['vip', 500], // VIP #2, #4 ahead of normal #1, #3
    ['status', 500], ['+bot', 1000], ['+bot', 1000], ['status', 500],
    ['-bot', 500],  // newest bot's order returns to PENDING
    ['status', 500], ['+bot', 20000], ['status', 500], // all orders finish, bots idle
    ['-bot', 0], ['-bot', 0], ['status', 0],
  ];
  for (const [cmd, wait] of steps) {
    write(`> ${cmd}`);
    handle(cmd);
    await sleep(wait);
  }
  controller.shutdown();
  await new Promise((r) => out.end(r));
}

function runInteractive() {
  const { controller, handle } = createSession((line) => console.log(line));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    if (['exit', 'quit'].includes(line.trim().toLowerCase())) return rl.close();
    handle(line);
    rl.prompt();
  });
  rl.on('close', () => { controller.shutdown(); process.exit(0); });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const demoIdx = args.indexOf('--demo');
  if (demoIdx !== -1) {
    runDemo(args[demoIdx + 1] || 'result.txt').catch((e) => { console.error(e); process.exit(1); });
  } else {
    runInteractive();
  }
}

module.exports = { createSession, formatStatus, timestamp };
