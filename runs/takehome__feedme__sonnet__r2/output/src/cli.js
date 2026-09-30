'use strict';

const readline = require('readline');
const { OrderController, NORMAL, VIP } = require('./orderController');

const HELP = `Commands:
  normal   add a New Normal Order
  vip      add a New VIP Order
  +bot     add a bot
  -bot     remove the newest bot
  status   show bots and orders
  help     show this help
  quit     exit`;

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatStatus({ pending, processing, complete, bots }) {
  const fmt = (o) => `${o.type}#${o.id}`;
  return [
    `Bots:       [${bots.map((b) => `#${b.id} ${b.state}`).join(', ')}]`,
    `PENDING:    [${pending.map(fmt).join(', ')}]`,
    `PROCESSING: [${processing.map((o) => `${fmt(o)} (bot #${o.bot})`).join(', ')}]`,
    `COMPLETE:   [${complete.map(fmt).join(', ')}]`,
  ].join('\n');
}

function createController(options) {
  const out = (line) => console.log(`[${timestamp()}] ${line}`);
  return new OrderController({ ...options, onEvent: out });
}

function execute(controller, command) {
  switch (command) {
    case 'normal': controller.addOrder(NORMAL); break;
    case 'vip': controller.addOrder(VIP); break;
    case '+bot': controller.addBot(); break;
    case '-bot':
      if (!controller.removeBot()) console.log('No bot to remove');
      break;
    case 'status': console.log(formatStatus(controller.status())); break;
    case 'help': console.log(HELP); break;
    case '': break;
    default: console.log(`Unknown command "${command}". Type "help".`);
  }
}

function runInteractive() {
  const controller = createController();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    const command = line.trim().toLowerCase();
    if (command === 'quit' || command === 'exit') return rl.close();
    execute(controller, command);
    rl.prompt();
  });
  rl.on('close', () => {
    controller.shutdown();
    process.exit(0);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scripted scenario covering the main user stories, run in real time (~35s).
async function runDemo() {
  console.log("McDonald's Order Management System - Simulation Results\n");
  const controller = createController();
  const steps = [
    ['normal', 500], ['vip', 500], ['normal', 500], ['vip', 500], // VIP #2 and #4 go ahead of normal
    ['+bot', 500], ['+bot', 500],                                 // bots take #2 and #4
    ['status', 500],
    ['-bot', 500],                                                // newest bot drops #4 back to PENDING
    ['status', 500],
    ['+bot', 12000],                                              // first orders complete meanwhile
    ['status', 10000],
    ['-bot', 0], ['-bot', 0], ['-bot', 0],
  ];
  for (const [command, wait] of steps) {
    console.log(`[${timestamp()}] > ${command}`);
    execute(controller, command);
    await sleep(wait);
  }
  console.log('\nFinal Status:');
  console.log(formatStatus(controller.status()));
  controller.shutdown();
}

if (require.main === module) {
  if (process.argv.includes('--demo')) runDemo();
  else runInteractive();
}

module.exports = { formatStatus, timestamp };
