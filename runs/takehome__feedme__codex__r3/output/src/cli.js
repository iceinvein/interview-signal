#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function timestamp(at = Date.now()) {
  return new Date(at).toISOString().slice(11, 19);
}

function log(message, at = Date.now()) {
  process.stdout.write(`[${timestamp(at)}] ${message}\n`);
}

function showStatus(controller) {
  const state = controller.getState();
  const orders = (items) => items.length
    ? items.map((order) => `#${order.id} ${order.type}`).join(', ')
    : '(none)';
  log(`PENDING: ${orders(state.pending)}`);
  log(`PROCESSING: ${state.processing.length
    ? state.processing.map(({ botId, order }) => `Bot #${botId}: #${order.id} ${order.type}`).join(', ')
    : '(none)'}`);
  log(`COMPLETE: ${orders(state.complete)}`);
  log(`BOTS: ${state.bots.length
    ? state.bots.map(({ id, status }) => `#${id} ${status}`).join(', ')
    : '(none)'}`);
}

function handleCommand(input, controller) {
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
    case '+ bot':
    case '+bot':
      controller.addBot();
      break;
    case '- bot':
    case '-bot':
      controller.removeBot();
      break;
    case 'status':
      showStatus(controller);
      break;
    case 'help':
      log('Commands: normal, vip, + bot, - bot, status, help, quit');
      break;
    case 'quit':
    case 'exit':
      return false;
    case '':
      break;
    default:
      log(`Unknown command: ${input.trim()}. Type help for commands.`);
  }
  return true;
}

function runInteractive() {
  const controller = new OrderController({ onEvent: ({ at, message }) => log(message, at) });
  log('Commands: normal, vip, + bot, - bot, status, help, quit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  if (process.stdin.isTTY) rl.setPrompt('order> ');
  if (process.stdin.isTTY) rl.prompt();
  rl.on('line', (line) => {
    if (!handleCommand(line, controller)) {
      // Clear active timers so quit exits immediately.
      while (controller.getState().bots.length) controller.removeBot();
      rl.close();
      return;
    }
    if (process.stdin.isTTY) rl.prompt();
  });
  rl.on('close', () => {
    while (controller.getState().bots.length) controller.removeBot();
  });
}

async function runDemo() {
  let finish;
  const allComplete = new Promise((resolve) => { finish = resolve; });
  const controller = new OrderController({ onEvent: ({ type, at, message }) => {
    log(message, at);
    if (type === 'completed' && controller.getState().complete.length === 3) finish();
  } });

  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  showStatus(controller);
  controller.addBot();
  controller.addBot();
  controller.removeBot(); // Interrupted NORMAL #1 returns ahead of NORMAL #2.
  showStatus(controller);
  controller.addBot();
  await allComplete;
  showStatus(controller);
  controller.removeBot();
  controller.removeBot();
  showStatus(controller);
}

if (require.main === module) {
  if (process.argv[2] === '--demo') runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  else runInteractive();
}

module.exports = { handleCommand, timestamp };
