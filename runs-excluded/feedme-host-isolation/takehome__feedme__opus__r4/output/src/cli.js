#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { OrderController, OrderType } from './orderController.js';
import { attachLogger, formatStatus } from './logger.js';

const HELP = `Commands:
  n, normal     New Normal Order
  v, vip        New VIP Order
  +, +bot       Add a bot
  -, -bot       Remove the newest bot
  s, status     Show bots, PENDING and COMPLETE areas
  wait <sec>    Pause before reading the next command (useful for scripts)
  h, help       Show this help
  q, quit       Print final status and exit`;

/** Executes one command line. Returns false when the session should end. */
async function execute(line, controller, log, write) {
  const [command, arg] = line.trim().split(/\s+/);
  switch (command?.toLowerCase()) {
    case '':
    case undefined:
      break;
    case 'n': case 'normal':
      controller.addOrder(OrderType.NORMAL);
      break;
    case 'v': case 'vip':
      controller.addOrder(OrderType.VIP);
      break;
    case '+': case '+bot':
      controller.addBot();
      break;
    case '-': case '-bot':
      if (!controller.removeBot()) log('No bot to remove');
      break;
    case 's': case 'status':
      log('Status');
      write(formatStatus(controller));
      break;
    case 'wait': {
      const seconds = Number(arg);
      if (!Number.isFinite(seconds) || seconds < 0) log('Usage: wait <seconds>');
      else await sleep(seconds * 1000);
      break;
    }
    case 'h': case 'help':
      write(HELP);
      break;
    case 'q': case 'quit': case 'exit':
      return false;
    default:
      log(`Unknown command "${command}". Type "help" for the list of commands.`);
  }
  return true;
}

async function main() {
  const write = (text) => process.stdout.write(`${text}\n`);
  const controller = new OrderController();
  const log = attachLogger(controller, write);
  const interactive = process.stdin.isTTY;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });

  write("McDonald's Order Management System\n");
  if (interactive) write(`${HELP}\n`);
  log(`System initialized with ${controller.bots.length} bots`);

  rl.setPrompt('> ');
  if (interactive) rl.prompt();
  for await (const line of rl) {
    if (!interactive && line.trim()) write(`> ${line.trim()}`);
    if (!(await execute(line, controller, log, write))) break;
    if (interactive) rl.prompt();
  }

  controller.shutdown();
  rl.close();
  write('\nFinal Status:');
  write(formatStatus(controller));
}

main();
