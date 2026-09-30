'use strict';

const readline = require('node:readline');
const { OrderController, OrderType } = require('./orderController');
const { createLogger } = require('./logger');

const HELP = `Commands:
  n, normal   New Normal Order
  v, vip      New VIP Order
  +, +bot     Add a bot
  -, -bot     Remove the newest bot
  s, status   Show PENDING / COMPLETE areas and bots
  h, help     Show this help
  q, quit     Exit`;

function printStatus(controller, log) {
  const { pending, complete, bots } = controller.status();
  log(`PENDING:  ${pending.join(', ') || '-'}`);
  log(`COMPLETE: ${complete.join(', ') || '-'}`);
  log(`BOTS:     ${bots.join(', ') || '-'}`);
}

function main() {
  const log = createLogger();
  const controller = new OrderController({ log });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

  const commands = {
    n: () => controller.addOrder(OrderType.NORMAL),
    v: () => controller.addOrder(OrderType.VIP),
    '+': () => controller.addBot(),
    '-': () => controller.removeBot(),
    s: () => printStatus(controller, log),
    h: () => console.log(HELP),
    q: () => rl.close(),
  };
  const aliases = { normal: 'n', vip: 'v', '+bot': '+', '-bot': '-', status: 's', help: 'h', quit: 'q', exit: 'q' };

  console.log("McDonald's Order Controller - type 'h' for help");
  rl.prompt();
  rl.on('line', (line) => {
    const input = line.trim().toLowerCase();
    const command = commands[aliases[input] ?? input];
    if (command) command();
    else if (input) console.log(`Unknown command: ${input} (type 'h' for help)`);
    rl.prompt();
  });
  rl.on('close', () => {
    controller.shutdown();
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { printStatus };
