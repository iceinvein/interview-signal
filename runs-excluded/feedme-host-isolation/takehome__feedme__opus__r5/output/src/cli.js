#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const readline = require('node:readline');
const { OrderController, ORDER_TYPE } = require('./OrderController');
const { createLogger } = require('./logger');

const HELP = `Commands:
  n | normal      New Normal Order
  v | vip         New VIP Order
  + | +bot        Add a cooking bot
  - | -bot        Remove the newest cooking bot
  s | status      Show bots, PENDING and COMPLETE areas
  w | wait <sec>  Wait for <sec> seconds (useful for scripted input)
  h | help        Show this help
  q | quit        Print final status and exit`;

function parseArgs(argv) {
  const outputIndex = argv.indexOf('--output');
  return { output: outputIndex !== -1 ? argv[outputIndex + 1] : null };
}

function formatStatus(controller) {
  const { bots, pending, completed } = controller.getStatus();
  const orderList = (orders) => orders.map((o) => `#${o.id}${o.type === ORDER_TYPE.VIP ? '(VIP)' : ''}`).join(', ') || '-';
  const botList = bots.map((b) => (b.orderId ? `#${b.id} PROCESSING #${b.orderId}` : `#${b.id} IDLE`)).join(', ') || '-';
  return [`Bots: ${botList}`, `PENDING: ${orderList(pending)}`, `COMPLETE: ${orderList(completed)}`];
}

function formatSummary(controller) {
  const { bots, pending, completed } = controller.getStatus();
  const vip = completed.filter((o) => o.type === ORDER_TYPE.VIP).length;
  return [
    'Final Status:',
    `- Orders Completed: ${completed.length} (${vip} VIP, ${completed.length - vip} Normal)`,
    `- Pending Orders: ${pending.length}`,
    `- Active Bots: ${bots.length}`,
  ];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { output } = parseArgs(process.argv.slice(2));
  const sinks = [(line) => console.log(line)];
  if (output) {
    fs.writeFileSync(output, "McDonald's Order Management System - Simulation Results\n\n");
    sinks.push((line) => fs.appendFileSync(output, `${line}\n`));
  }

  const log = createLogger(sinks);
  const print = (lines) => lines.forEach((line) => sinks.forEach((write) => write(line)));
  const controller = new OrderController({ onEvent: log });

  const interactive = process.stdin.isTTY;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
  if (interactive) {
    console.log(HELP);
    rl.setPrompt('> ');
    rl.prompt();
  }

  log('System initialized with 0 bots');

  // Lines are handled one at a time so `wait` pauses subsequent commands.
  for await (const rawLine of rl) {
    const [command, arg] = rawLine.trim().toLowerCase().split(/\s+/);
    if (!command || command.startsWith('#')) {
      if (interactive) rl.prompt();
      continue;
    }

    switch (command) {
      case 'n': case 'normal': controller.addOrder(ORDER_TYPE.NORMAL); break;
      case 'v': case 'vip': controller.addOrder(ORDER_TYPE.VIP); break;
      case '+': case '+bot': controller.addBot(); break;
      case '-': case '-bot': controller.removeBot(); break;
      case 's': case 'status': formatStatus(controller).forEach((line) => log(line)); break;
      case 'w': case 'wait': {
        const seconds = Number(arg);
        if (Number.isFinite(seconds) && seconds >= 0) await sleep(seconds * 1000);
        else console.log('Usage: wait <seconds>');
        break;
      }
      case 'h': case 'help': console.log(HELP); break;
      case 'q': case 'quit': case 'exit': rl.close(); break;
      default: console.log(`Unknown command "${command}". Type "help" for commands.`);
    }
    if (interactive) rl.prompt();
  }

  print(['', ...formatSummary(controller)]);
  controller.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
