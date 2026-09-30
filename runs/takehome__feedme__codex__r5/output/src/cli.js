'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function stamp(date = new Date()) {
  return date.toISOString().slice(11, 19);
}

function write(message, at = new Date()) {
  process.stdout.write(`[${stamp(at)}] ${message}\n`);
}

function showStatus(controller) {
  const state = controller.snapshot();
  const orders = (list) => list.length
    ? list.map((order) => `#${order.id} ${order.type}`).join(', ')
    : '(none)';
  write(`PENDING: ${orders(state.pending)}`);
  write(`PROCESSING: ${state.processing.length
    ? state.processing.map((order) => `#${order.id} ${order.type} (bot #${order.botId})`).join(', ')
    : '(none)'}`);
  write(`COMPLETE: ${orders(state.complete)}`);
  write(`BOTS: ${state.bots.length
    ? state.bots.map((bot) => `#${bot.id} ${bot.status}`).join(', ')
    : '(none)'}`);
}

function runCommand(controller, input) {
  switch (input.trim().toLowerCase()) {
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
    case 'add-bot':
      controller.addBot();
      break;
    case '-':
    case '- bot':
    case 'remove-bot':
      controller.removeBot();
      break;
    case 'status':
      showStatus(controller);
      break;
    case 'help':
      write('Commands: normal, vip, +, -, status, help, quit');
      break;
    case 'quit':
    case 'exit':
      return false;
    case '':
      break;
    default:
      write('Unknown command. Type help for available commands.');
  }
  return true;
}

async function interactive() {
  const controller = new OrderController({ onEvent: ({ at, message }) => write(message, at) });
  const terminal = Boolean(process.stdin.isTTY);
  const input = readline.createInterface({ input: process.stdin, terminal });
  write('Order controller ready. Type help for commands.');
  if (terminal) input.setPrompt('order> ');
  if (terminal) input.prompt();
  for await (const line of input) {
    if (!runCommand(controller, line)) break;
    if (terminal) input.prompt();
  }
  input.close();
  controller.dispose();
}

async function demo() {
  let completed = 0;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const controller = new OrderController({
    onEvent: ({ at, message }) => {
      write(message, at);
      if (message.includes(': COMPLETE') && ++completed === 4) resolveDone();
    },
  });
  write('Demo started');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  showStatus(controller);
  controller.addBot();
  controller.addBot();
  controller.removeBot();
  controller.addBot();
  showStatus(controller);
  await done;
  showStatus(controller);
  controller.dispose();
  write('Demo finished');
}

const mode = process.argv[2] || '--interactive';
if (mode === '--demo') {
  demo().catch((error) => { console.error(error); process.exitCode = 1; });
} else if (mode === '--interactive') {
  interactive().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  console.error('Usage: node src/cli.js [--interactive|--demo]');
  process.exitCode = 1;
}
