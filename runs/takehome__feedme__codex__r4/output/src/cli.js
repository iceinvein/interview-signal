#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function log(message, at = new Date()) {
  process.stdout.write(`[${at.toISOString().slice(11, 19)}] ${message}\n`);
}

const controller = new OrderController({ onEvent: ({ at, message }) => log(message, at) });

function showStatus() {
  const state = controller.getState();
  const orders = (items) => items.map(({ id, type }) => `${type} #${id}`).join(', ') || '(empty)';
  log(`PENDING: ${orders(state.pending)}`);
  log(`PROCESSING: ${state.processing.map(({ botId, orderId, type }) => `Bot #${botId}: ${type} #${orderId}`).join(', ') || '(empty)'}`);
  log(`COMPLETE: ${orders(state.complete)}`);
  log(`BOTS: ${state.bots.map(({ id, status }) => `#${id} ${status}`).join(', ') || '(none)'}`);
}

function handleCommand(input) {
  const command = input.trim().toLowerCase().replace(/\s+/g, ' ');
  switch (command) {
    case 'normal':
    case 'new normal order':
      controller.addOrder('NORMAL');
      break;
    case 'vip':
    case 'new vip order':
      controller.addOrder('VIP');
      break;
    case '+':
    case '+ bot':
      controller.addBot();
      break;
    case '-':
    case '- bot':
      controller.removeBot();
      break;
    case 'status':
      showStatus();
      break;
    case 'help':
      log('Commands: normal, vip, +, -, status, help, quit');
      break;
    case 'quit':
    case 'exit':
      controller.shutdown();
      return false;
    case '':
      break;
    default:
      log(`Unknown command: ${input.trim()}. Type help for commands.`);
  }
  return true;
}

async function demo() {
  log('Order controller demo started');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  showStatus();
  controller.addBot();
  controller.addBot();
  controller.removeBot();
  showStatus();
  controller.addBot();
  await new Promise((resolve) => setTimeout(resolve, 10_050));
  showStatus();
  log('Demo finished');
}

function interactive() {
  log('Order controller ready. Type help for commands.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  rl.on('line', (line) => {
    if (!handleCommand(line)) rl.close();
  });
  rl.on('close', () => {
    controller.shutdown();
    log('CLI closed');
  });
}

if (process.argv[2] === '--demo') {
  demo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  interactive();
}
