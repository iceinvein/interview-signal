'use strict';

const readline = require('node:readline');
const { setTimeout: sleep } = require('node:timers/promises');
const { OrderController, ORDER_TYPE } = require('./orderController');

const HELP = `Commands:
  n, normal     New Normal Order
  v, vip        New VIP Order
  +, add-bot    Add a cooking bot
  -, remove-bot Remove the newest cooking bot
  s, status     Show PENDING / PROCESSING / COMPLETE areas and bots
  w, wait <sec> Wait for <sec> seconds (useful for scripted input)
  h, help       Show this help
  q, quit       Print final status and exit`;

function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function createLogger(write = (line) => process.stdout.write(`${line}\n`)) {
  return (message) => write(`[${formatTime()}] ${message}`);
}

function formatOrders(orders) {
  return orders.length ? orders.map((o) => `${o.type} #${o.id}`).join(', ') : '-';
}

function formatStatus(controller) {
  const { pending, processing, completed, bots } = controller.getStatus();
  const botList = bots.length
    ? bots.map((b) => `#${b.id} ${b.status}${b.orderId ? ` (Order #${b.orderId})` : ''}`).join(', ')
    : '-';
  return [
    `PENDING:    ${formatOrders(pending)}`,
    `PROCESSING: ${formatOrders(processing.map((p) => p.order))}`,
    `COMPLETE:   ${formatOrders(completed)}`,
    `BOTS:       ${botList}`,
  ].join('\n');
}

function formatSummary(controller) {
  const { pending, processing, completed, bots } = controller.getStatus();
  const vip = completed.filter((o) => o.type === ORDER_TYPE.VIP).length;
  return [
    'Final Status:',
    `- Orders Completed: ${completed.length} (${vip} VIP, ${completed.length - vip} Normal)`,
    `- Orders Processing: ${processing.length}`,
    `- Pending Orders: ${pending.length}`,
    `- Active Bots: ${bots.length}`,
  ].join('\n');
}

// Executes one command line. Returns false when the session should end.
async function executeCommand(controller, line, print) {
  const [command, arg] = line.trim().toLowerCase().split(/\s+/);
  switch (command) {
    case '':
      break;
    case 'n':
    case 'normal':
      controller.addOrder(ORDER_TYPE.NORMAL);
      break;
    case 'v':
    case 'vip':
      controller.addOrder(ORDER_TYPE.VIP);
      break;
    case '+':
    case 'add-bot':
      controller.addBot();
      break;
    case '-':
    case 'remove-bot':
      controller.removeBot();
      break;
    case 's':
    case 'status':
      print(formatStatus(controller));
      break;
    case 'w':
    case 'wait': {
      const seconds = Number(arg);
      if (!Number.isFinite(seconds) || seconds < 0) print('Usage: wait <seconds>');
      else await sleep(seconds * 1000);
      break;
    }
    case 'h':
    case 'help':
      print(HELP);
      break;
    case 'q':
    case 'quit':
      return false;
    default:
      print(`Unknown command: "${command}". Type "help" for commands.`);
  }
  return true;
}

async function main({ input = process.stdin, output = process.stdout } = {}) {
  const print = (text) => output.write(`${text}\n`);
  const log = createLogger(print);
  const controller = new OrderController({ log });
  const interactive = Boolean(input.isTTY);

  print("McDonald's Order Management System");
  log(`System initialized with ${controller.bots.length} bots`);
  if (interactive) print(HELP);

  const rl = readline.createInterface({ input, output: interactive ? output : undefined, terminal: interactive });
  rl.setPrompt('> ');
  if (interactive) rl.prompt();

  for await (const line of rl) {
    if (!(await executeCommand(controller, line, print))) break;
    if (interactive) rl.prompt();
  }
  rl.close();

  controller.shutdown();
  print('');
  print(formatStatus(controller));
  print('');
  print(formatSummary(controller));
}

module.exports = { main, executeCommand, formatTime, formatStatus };
