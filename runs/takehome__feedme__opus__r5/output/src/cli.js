#!/usr/bin/env node
'use strict';

// Interactive CLI: type commands to create orders and manage bots in real time.

const readline = require('node:readline');
const { OrderController, OrderType } = require('./OrderController');
const { attachLogger, formatStatus } = require('./logger');

const HELP = [
  'Commands:',
  '  n, normal   New Normal Order',
  '  v, vip      New VIP Order',
  '  +, +bot     Add a bot',
  '  -, -bot     Remove the newest bot',
  '  s, status   Show PENDING / PROCESSING / COMPLETE areas and bots',
  '  h, help     Show this help',
  '  q, quit     Exit',
].join('\n');

function main() {
  const controller = new OrderController();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

  // Print above the prompt without clobbering what the user is typing.
  const write = (line) => {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(line);
    rl.prompt(true);
  };
  const log = attachLogger(controller, write);

  const commands = {
    n: () => controller.addOrder(OrderType.NORMAL),
    v: () => controller.addOrder(OrderType.VIP),
    '+': () => controller.addBot(),
    '-': () => controller.removeBot() || log('No bot to remove'),
    s: () => formatStatus(controller.getStatus()).forEach((line) => log(line)),
    h: () => console.log(HELP),
  };
  const aliases = { normal: 'n', vip: 'v', '+bot': '+', '-bot': '-', status: 's', help: 'h', quit: 'q', exit: 'q' };

  rl.on('line', (input) => {
    const key = input.trim().toLowerCase();
    const name = aliases[key] ?? key;
    if (name === 'q') return rl.close();

    const command = commands[name];
    if (command) command();
    else if (key) console.log(`Unknown command "${key}". Type "h" for help.`);
    rl.prompt();
  });

  rl.on('close', () => {
    controller.shutdown();
    console.log('Bye!');
  });

  console.log("McDonald's Order Controller");
  console.log(HELP);
  rl.prompt();
}

main();
