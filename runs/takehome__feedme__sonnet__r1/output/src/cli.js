#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController, OrderType } = require('./orderController');

const HELP = `Commands:
  normal   add a new Normal order
  vip      add a new VIP order
  +bot     add a cooking bot
  -bot     remove the newest cooking bot
  status   show PENDING / COMPLETE areas and bots
  help     show this help
  quit     exit`;

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function formatStatus({ pending, complete, bots }) {
  const orders = (list) => list.map((o) => `${o.type}#${o.id}`).join(', ') || '-';
  const botList =
    bots.map((b) => `#${b.id}(${b.state}${b.order ? ` order #${b.order}` : ''})`).join(', ') || '-';
  return `PENDING: ${orders(pending)}\nCOMPLETE: ${orders(complete)}\nBOTS: ${botList}`;
}

function execute(controller, command) {
  switch (command) {
    case 'normal':
      return controller.addOrder(OrderType.NORMAL);
    case 'vip':
      return controller.addOrder(OrderType.VIP);
    case '+bot':
      return controller.addBot();
    case '-bot':
      if (!controller.removeBot()) log('No bots to remove');
      return;
    case 'status':
      return console.log(formatStatus(controller.status()));
    case 'help':
      return console.log(HELP);
    default:
      return console.log(`Unknown command "${command}". Type "help".`);
  }
}

function runInteractive() {
  const controller = new OrderController({ onEvent: log });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log(`McDonald's Order Controller\n${HELP}`);
  rl.prompt();
  rl.on('line', (line) => {
    const command = line.trim().toLowerCase();
    if (command === 'quit' || command === 'exit') return rl.close();
    if (command) execute(controller, command);
    rl.prompt();
  });
  // Bots hold timers; exit explicitly so pending work doesn't keep the process alive.
  rl.on('close', () => process.exit(0));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario covering every requirement, in real time (~25s). */
async function runDemo() {
  const controller = new OrderController({ onEvent: log });
  const steps = [
    ['normal', 500], ['vip', 500], ['normal', 500], ['vip', 500],
    ['+bot', 1000], ['+bot', 1000],
    ['status', 2000],
    ['-bot', 500], // newest bot dropped mid-order; order returns to PENDING
    ['status', 500],
    ['+bot', 12000],
    ['status', 0],
  ];
  console.log("McDonald's Order Management System - Simulation Results\n");
  log('System initialized with 0 bots');
  for (const [command, delay] of steps) {
    log(`> ${command}`);
    execute(controller, command);
    await sleep(delay);
  }
  // Wait for everything still in flight.
  while (controller.status().bots.some((b) => b.state === 'PROCESSING') || controller.status().pending.length) {
    await sleep(500);
  }
  const { pending, complete, bots } = controller.status();
  console.log(
    `\nFinal Status:\n- Orders Completed: ${complete.length}\n- Active Bots: ${bots.length}\n- Pending Orders: ${pending.length}`
  );
  process.exit(0);
}

if (require.main === module) {
  if (process.argv.includes('--demo')) runDemo();
  else runInteractive();
}

module.exports = { formatStatus, timestamp };
