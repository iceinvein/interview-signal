#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController, OrderType } = require('./orderController');
const { attachLogger, formatStatus } = require('./logger');

const HELP = `Commands:
  n, normal   New Normal Order
  v, vip      New VIP Order
  +, add      + Bot
  -, remove   - Bot
  s, status   Show PENDING / PROCESSING / COMPLETE areas and bots
  h, help     Show this help
  q, quit     Exit`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runCommand(controller, log, input) {
  switch (input.trim().toLowerCase()) {
    case 'n':
    case 'normal':
      controller.addOrder(OrderType.NORMAL);
      break;
    case 'v':
    case 'vip':
      controller.addOrder(OrderType.VIP);
      break;
    case '+':
    case 'add':
      controller.addBot();
      break;
    case '-':
    case 'remove':
      if (!controller.removeBot()) log('No bot to remove');
      break;
    case 's':
    case 'status':
      formatStatus(controller).split('\n').forEach((line) => log(line));
      break;
    case 'h':
    case 'help':
      console.log(HELP);
      break;
    case '':
      break;
    case 'q':
    case 'quit':
      return false;
    default:
      log(`Unknown command "${input.trim()}". Type "h" for help.`);
  }
  return true;
}

function interactive(controller, log) {
  console.log("McDonald's Order Controller (interactive)");
  console.log(HELP);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    if (!runCommand(controller, log, line)) return rl.close();
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

/** Scripted scenario used by scripts/run.sh to produce result.txt. */
async function demo(controller, log) {
  console.log("McDonald's Order Management System - Simulation Results\n");
  log(`System initialized with ${controller.bots.length} bots`);

  controller.addOrder(OrderType.NORMAL); // #1
  controller.addOrder(OrderType.VIP); //    #2 -> jumps ahead of #1
  controller.addOrder(OrderType.NORMAL); // #3
  controller.addBot(); //                   Bot #1 takes VIP #2
  controller.addBot(); //                   Bot #2 takes Normal #1
  await sleep(2000);
  controller.addOrder(OrderType.VIP); //    #4 -> queued before Normal #3
  await sleep(2000);
  controller.removeBot(); //                Bot #2 destroyed, Normal #1 returns ahead of #3
  formatStatus(controller).split('\n').forEach((line) => log(line));
  await sleep(1000);
  controller.addBot(); //                   Bot #3 takes VIP #4

  while (!controller.isIdle()) await sleep(200);

  controller.removeBot();
  console.log('\nFinal Status:');
  formatStatus(controller).split('\n').forEach((line) => log(line));
}

function main() {
  const processingTimeMs = process.env.PROCESSING_MS ? Number(process.env.PROCESSING_MS) : undefined;
  const controller = new OrderController({ processingTimeMs });
  const log = attachLogger(controller);

  if (process.argv.includes('--demo')) {
    demo(controller, log).then(() => process.exit(0));
  } else {
    interactive(controller, log);
  }
}

if (require.main === module) main();

module.exports = { runCommand };
