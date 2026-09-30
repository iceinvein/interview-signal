'use strict';

const readline = require('node:readline');
const { OrderController } = require('./order-controller');

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

function print(message, date = new Date()) {
  process.stdout.write(`[${timestamp(date)}] ${message}\n`);
}

function printStatus(status) {
  const orders = (items) => items.length
    ? items.map((order) => `${order.type} #${order.id}`).join(', ')
    : '(none)';
  print(`PENDING: ${orders(status.pending)}`);
  print(`PROCESSING: ${status.processing.length
    ? status.processing.map(({ botId, order }) => `Bot #${botId}: ${order.type} #${order.id}`).join(', ')
    : '(none)'}`);
  print(`COMPLETE: ${orders(status.completed)}`);
  print(`BOTS: ${status.bots.length
    ? status.bots.map((bot) => `#${bot.id} ${bot.status}`).join(', ')
    : '(none)'}`);
}

function createController() {
  return new OrderController({ onEvent: ({ time, message }) => print(message, time) });
}

function handleCommand(command, controller) {
  switch (command.trim().toLowerCase()) {
    case 'normal':
      controller.newOrder('NORMAL');
      break;
    case 'vip':
      controller.newOrder('VIP');
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
      printStatus(controller.getStatus());
      break;
    case 'help':
      print('Commands: normal, vip, + bot, - bot, status, help, quit');
      break;
    case 'quit':
    case 'exit':
      return false;
    case '':
      break;
    default:
      print(`Unknown command: ${command.trim()}. Type help for commands.`);
  }
  return true;
}

function runInteractive() {
  const controller = createController();
  const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  print('Order controller ready. Type help for commands.');
  if (process.stdin.isTTY) {
    input.setPrompt('order> ');
    input.prompt();
  }
  input.on('line', (line) => {
    if (!handleCommand(line, controller)) {
      input.close();
      process.stdout.write(`[${timestamp()}] CLI closed\n`, () => process.exit(0));
      return;
    }
    if (process.stdin.isTTY) input.prompt();
  });
}

async function runDemo() {
  const controller = createController();
  print('Demo started');
  controller.newOrder('NORMAL');
  controller.newOrder('NORMAL');
  controller.newOrder('VIP');
  controller.addBot();
  controller.addBot();
  controller.removeBot();
  printStatus(controller.getStatus());
  controller.addBot();
  controller.addBot();
  await new Promise((resolve) => setTimeout(resolve, 10_100));
  printStatus(controller.getStatus());
  print('Demo finished');
}

if (require.main === module) {
  if (process.argv[2] === '--demo') {
    runDemo().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  } else {
    runInteractive();
  }
}

module.exports = { handleCommand, printStatus, timestamp };
