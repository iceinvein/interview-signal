#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { OrderController } = require('./orderController');

const HELP = `Commands:
  normal   add a new normal order
  vip      add a new VIP order
  +bot     add a bot
  -bot     remove the newest bot
  status   show pending / processing / complete
  help     show this help
  quit     exit`;

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function formatStatus(s) {
  const ids = (orders) => orders.map((o) => `${o.vip ? 'V' : 'N'}${o.id}`).join(', ');
  return [
    `PENDING:    [${ids(s.pending)}]`,
    `PROCESSING: [${s.processing.map((p) => `bot${p.bot}->#${p.order}`).join(', ')}]`,
    `COMPLETE:   [${ids(s.complete)}]`,
    `Bots: ${s.bots} (${s.idleBots} idle)`,
  ].join('\n');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scripted scenario covering every requirement; used by scripts/run.sh.
async function runDemo(controller) {
  const steps = [
    [0, () => controller.addOrder(false)],
    [0, () => controller.addOrder(true)],
    [0, () => controller.addOrder(false)],
    [0, () => controller.addOrder(true)], // queues behind VIP #2, ahead of normals
    [1000, () => controller.addBot()],
    [1000, () => controller.addBot()],
    [1000, () => controller.removeBot()], // bot 2 is busy: its order returns to PENDING
    [1000, () => controller.addBot()],
    [1000, () => log(`status:\n${formatStatus(controller.status())}`)],
  ];
  for (const [delay, step] of steps) {
    await sleep(delay);
    step();
  }
  while (controller.status().pending.length || controller.status().processing.length) {
    await sleep(500);
  }
  log(`Final status:\n${formatStatus(controller.status())}`);
}

function runInteractive(controller) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  const commands = {
    normal: () => controller.addOrder(false),
    vip: () => controller.addOrder(true),
    '+bot': () => controller.addBot(),
    '-bot': () => controller.removeBot(),
    status: () => console.log(formatStatus(controller.status())),
    help: () => console.log(HELP),
    quit: () => rl.close(),
  };
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    const command = line.trim().toLowerCase();
    if (command && !commands[command]) console.log(`Unknown command "${command}". Type "help".`);
    else if (command) commands[command]();
    if (command !== 'quit') rl.prompt();
  });
  rl.on('close', () => {
    // Pending bot timers must not keep the process alive after quitting.
    process.exit(0);
  });
}

function main() {
  const controller = new OrderController({ onEvent: log });
  if (process.argv.includes('--demo')) runDemo(controller);
  else runInteractive(controller);
}

if (require.main === module) main();

module.exports = { timestamp, formatStatus };
