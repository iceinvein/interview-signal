#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function timestamp(at = Date.now()) {
  return new Date(at).toISOString().slice(11, 19);
}

function line(message, at) {
  console.log(`[${timestamp(at)}] ${message}`);
}

function describeOrder(order) {
  return `#${order.id} ${order.type}`;
}

function showStatus(controller) {
  const status = controller.getStatus();
  for (const area of ['pending', 'processing', 'complete']) {
    const orders = status[area].map(describeOrder).join(', ') || '(empty)';
    line(`${area.toUpperCase()}: ${orders}`);
  }
  const bots = status.bots.map((bot) =>
    `#${bot.id} ${bot.status}${bot.orderId === null ? '' : ` order #${bot.orderId}`}`
  ).join(', ') || '(none)';
  line(`BOTS: ${bots}`);
}

function logEvent(event) {
  const order = event.orderId ? `${event.orderType} order #${event.orderId}` : '';
  const bot = event.botId ? `Bot #${event.botId}` : '';
  const messages = {
    'order-created': `${order} created; PENDING`,
    'bot-created': `${bot} created; IDLE`,
    'order-started': `${bot} picked up ${order}; PROCESSING for 10 seconds`,
    'order-returned': `${bot} stopped ${order}; returned to PENDING`,
    'bot-removed': `${bot} removed`,
    'order-completed': `${bot} completed ${order}; COMPLETE after 10 seconds`,
    'bot-idle': `${bot} is IDLE`,
  };
  line(messages[event.type], event.at);
}

async function runDemo() {
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const controller = new OrderController({
    onEvent(event) {
      logEvent(event);
      if (event.type === 'order-completed' && controller.getStatus().complete.length === 4) {
        resolveDone();
      }
    },
  });

  line('Demo started');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  showStatus(controller);

  controller.addBot();
  controller.addBot();
  controller.removeBot();
  showStatus(controller);
  controller.addBot();

  await done;
  controller.removeBot(); // The newest bot is now idle.
  line('Final status');
  showStatus(controller);
}

async function runInteractive() {
  const controller = new OrderController({ onEvent: logEvent });
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  line('Commands: normal, vip, + (add bot), - (remove newest bot), status, help, quit');
  if (process.stdin.isTTY) input.setPrompt(`[${timestamp()}] command> `);
  if (process.stdin.isTTY) input.prompt();

  for await (const raw of input) {
    const command = raw.trim().toLowerCase();
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
      case 'add-bot':
      case '+ bot':
        controller.addBot();
        break;
      case '-':
      case 'remove-bot':
      case '- bot':
        if (controller.removeBot() === null) line('No bot to remove');
        break;
      case 'status':
        showStatus(controller);
        break;
      case 'help':
        line('Commands: normal, vip, +, -, status, help, quit');
        break;
      case 'quit':
      case 'exit':
        while (controller.getStatus().bots.length) controller.removeBot();
        line('Goodbye');
        input.close();
        return;
      default:
        line(`Unknown command: ${raw.trim() || '(blank)'}. Type help for commands.`);
    }
    if (process.stdin.isTTY) input.prompt();
  }

  // End of piped input also ends the session and cancels any active timers.
  while (controller.getStatus().bots.length) controller.removeBot();
}

async function main() {
  const mode = process.argv[2] || '--interactive';
  if (mode === '--demo') await runDemo();
  else if (mode === '--interactive') await runInteractive();
  else {
    line('Usage: node src/cli.js [--interactive|--demo]');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    line(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { timestamp, showStatus, logEvent };
