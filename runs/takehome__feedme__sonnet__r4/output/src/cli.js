#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const readline = require('node:readline');
const { OrderController } = require('./orderController');

const HELP = `Commands:
  n | normal   New Normal Order
  v | vip      New VIP Order
  + | addbot   Add a bot
  - | rmbot    Remove the newest bot
  s | status   Show PENDING / COMPLETE / bots
  h | help     Show this help
  q | quit     Exit`;

const pad = (n) => String(n).padStart(2, '0');
const timestamp = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function formatStatus({ pending, complete, bots }) {
  const list = (orders) => orders.map((o) => `${o.type[0]}${o.id}`).join(', ') || '-';
  const botList = bots.map((b) => `#${b.id}:${b.state}${b.orderId ? `(order ${b.orderId})` : ''}`).join(', ') || '-';
  return [`PENDING:  ${list(pending)}`, `COMPLETE: ${list(complete)}`, `BOTS:     ${botList}`].join('\n');
}

function createController(write, options) {
  return new OrderController({ ...options, onEvent: (msg) => write(`[${timestamp()}] ${msg}`) });
}

/** Returns false when the user asks to quit. */
function handleCommand(controller, input, write) {
  switch (input.trim().toLowerCase()) {
    case 'n': case 'normal': controller.addNormalOrder(); break;
    case 'v': case 'vip': controller.addVipOrder(); break;
    case '+': case 'addbot': controller.addBot(); break;
    case '-': case 'rmbot':
      if (!controller.removeBot()) write('No bots to remove');
      break;
    case 's': case 'status': write(formatStatus(controller.status())); break;
    case 'h': case 'help': case '?': write(HELP); break;
    case 'q': case 'quit': case 'exit': return false;
    case '': break;
    default: write(`Unknown command "${input.trim()}". Type "help".`);
  }
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario that exercises every requirement; writes to result.txt. */
async function runDemo(outputFile) {
  const lines = [];
  const write = (line) => { lines.push(line); console.log(line); };
  const controller = createController(write);
  write("McDonald's Order Controller - Simulation Results\n");
  const steps = [
    [() => controller.addNormalOrder(), 500],
    [() => controller.addVipOrder(), 500],
    [() => controller.addNormalOrder(), 500],
    [() => controller.addVipOrder(), 500],
    [() => controller.addBot(), 1000],
    [() => controller.addBot(), 1000],
    [() => controller.removeBot(), 1000], // newest bot's order returns to PENDING
    [() => controller.addBot(), 22000],   // everything drains, bots go IDLE
    [() => write(`\nFinal status\n${formatStatus(controller.status())}`), 0],
  ];
  for (const [step, delay] of steps) {
    step();
    await sleep(delay);
  }
  controller.shutdown();
  fs.writeFileSync(outputFile, lines.join('\n') + '\n');
}

function runInteractive() {
  const controller = createController(console.log);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    if (handleCommand(controller, line, console.log)) rl.prompt();
    else rl.close();
  });
  rl.on('close', () => { controller.shutdown(); process.exit(0); });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--demo') runDemo(args[1] || 'result.txt');
  else runInteractive();
}

module.exports = { handleCommand, formatStatus, timestamp };
