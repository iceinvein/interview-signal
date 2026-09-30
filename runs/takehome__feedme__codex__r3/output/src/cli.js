'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function timestamp(at) {
  return new Date(at).toISOString().slice(11, 19);
}

function print(message, at = Date.now()) {
  process.stdout.write(`[${timestamp(at)}] ${message}\n`);
}

const controller = new OrderController({ onEvent: ({ at, message }) => print(message, at) });
const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let quitting = false;
let chain = Promise.resolve();

function status() {
  const state = controller.snapshot();
  const orders = list => list.length ? list.map(order => `${order.type} #${order.number}`).join(', ') : '(none)';
  print(`PENDING: ${orders(state.pending)}`);
  print(`PROCESSING: ${state.processing.length ? state.processing.map(item => `Bot #${item.bot}: ${item.order.type} #${item.order.number}`).join(', ') : '(none)'}`);
  print(`COMPLETE: ${orders(state.complete)}`);
  print(`BOTS: ${state.bots.length ? state.bots.map(bot => `#${bot.number} ${bot.status}`).join(', ') : '(none)'}`);
}

async function command(line) {
  const [name, argument, ...extra] = line.trim().toLowerCase().split(/\s+/);
  if (!name) return;
  if (extra.length) {
    print('Invalid command. Type help for usage.');
    return;
  }
  switch (name) {
    case 'normal':
      if (argument) break;
      controller.newOrder('Normal');
      return;
    case 'vip':
      if (argument) break;
      controller.newOrder('VIP');
      return;
    case '+':
    case 'add':
      if (argument) break;
      controller.addBot();
      return;
    case '-':
    case 'remove':
      if (argument) break;
      controller.removeBot();
      return;
    case 'status':
      if (argument) break;
      status();
      return;
    case 'wait': {
      const seconds = Number(argument);
      if (!argument || !Number.isFinite(seconds) || seconds < 0 || seconds > 60) break;
      print(`Waiting ${seconds}s`);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return;
    }
    case 'help':
      if (argument) break;
      print('Commands: normal, vip, + (add bot), - (remove newest bot), status, wait <seconds>, help, quit');
      return;
    case 'quit':
    case 'exit':
      if (argument) break;
      quitting = true;
      input.close();
      return;
    default:
      break;
  }
  print('Invalid command. Type help for usage.');
}

print('Order controller ready. Type help for commands.');
if (process.stdin.isTTY) input.setPrompt('> ');
if (process.stdin.isTTY) input.prompt();
input.on('line', line => {
  chain = chain.then(() => quitting ? undefined : command(line)).then(() => {
    if (process.stdin.isTTY && !quitting) input.prompt();
  }).catch(error => {
    print(`Error: ${error.message}`);
    process.exitCode = 1;
  });
});
input.on('close', () => {
  chain.then(() => {
    controller.close();
    print('Session ended');
  });
});
