#!/usr/bin/env node
import readline from 'node:readline';
import { OrderController, OrderType } from './orderController.js';
import { createLogger } from './logger.js';

const HELP = `Commands:
  n, normal   New Normal Order
  v, vip      New VIP Order
  +, +bot     Add a bot
  -, -bot     Remove the newest bot
  s, status   Show PENDING / COMPLETE / bots
  h, help     Show this help
  q, quit     Exit`;

const controller = new OrderController({ log: createLogger() });

function printStatus() {
  const { pending, complete, bots } = controller.status();
  console.log(`PENDING : [${pending.join(', ')}]`);
  console.log(`COMPLETE: [${complete.join(', ')}]`);
  console.log(`BOTS    : [${bots.join(', ')}]`);
}

const commands = {
  n: () => controller.addOrder(OrderType.NORMAL),
  v: () => controller.addOrder(OrderType.VIP),
  '+': () => controller.addBot(),
  '-': () => controller.removeBot(),
  s: printStatus,
  h: () => console.log(HELP),
  q: () => rl.close(),
};
const aliases = { normal: 'n', vip: 'v', '+bot': '+', '-bot': '-', status: 's', help: 'h', quit: 'q', exit: 'q' };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

console.log("McDonald's Order Controller - type 'help' for commands");
rl.prompt();
rl.on('line', (line) => {
  const input = line.trim().toLowerCase();
  if (input) {
    const command = commands[aliases[input] ?? input];
    if (command) command();
    else console.log(`Unknown command: ${input}. Type 'help'.`);
  }
  rl.prompt();
});
rl.on('close', () => process.exit(0));
