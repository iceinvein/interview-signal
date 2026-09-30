#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { setTimeout: delay } = require('node:timers/promises');
const { OrderController } = require('./order-controller');

const controller = new OrderController({ onEvent: line => console.log(line) });

function showStatus() {
  const state = controller.status();
  controller.emit(`PENDING: ${formatOrders(state.pending)}`);
  controller.emit(`PROCESSING: ${state.processing.length ? state.processing.map(item => `#${item.orderId} (${item.type}, bot #${item.botId})`).join(', ') : 'none'}`);
  controller.emit(`COMPLETE: ${formatOrders(state.complete)}`);
  controller.emit(`BOTS: ${state.bots.length ? state.bots.map(bot => `#${bot.id} ${bot.status}`).join(', ') : 'none'}`);
}

function formatOrders(orders) {
  return orders.length ? orders.map(order => `#${order.id} (${order.type})`).join(', ') : 'none';
}

function execute(input) {
  switch (input.trim().toLowerCase()) {
    case 'normal':
    case 'new normal order':
      controller.addOrder('Normal');
      break;
    case 'vip':
    case 'new vip order':
      controller.addOrder('VIP');
      break;
    case '+ bot':
    case 'add bot':
      controller.addBot();
      break;
    case '- bot':
    case 'remove bot':
      controller.removeBot();
      break;
    case 'status':
      showStatus();
      break;
    case 'help':
      controller.emit('Commands: normal, vip, + bot, - bot, status, help, exit');
      break;
    case 'exit':
    case 'quit':
      controller.emit('Goodbye');
      return false;
    case '':
      break;
    default:
      controller.emit(`Unknown command: ${input.trim()}. Type help for commands.`);
  }
  return true;
}

async function demo() {
  controller.emit('Demo started');
  controller.addOrder('Normal');
  controller.addOrder('VIP');
  controller.addBot();
  controller.addBot();
  controller.removeBot(); // Interrupts normal order #1.
  controller.addOrder('VIP');
  controller.addBot();
  showStatus();
  await delay(20_200);
  showStatus();
  controller.emit('Demo finished');
}

function interactive() {
  controller.emit('Order controller ready. Type help for commands.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', input => {
    if (!execute(input)) {
      rl.close();
      process.exit(0);
    }
  });
}

if (process.argv[2] === '--demo') {
  demo().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.length === 2) {
  interactive();
} else {
  console.error('Usage: node src/cli.js [--demo]');
  process.exitCode = 1;
}
