'use strict';

const readline = require('node:readline');
const { OrderController, ORDER_TYPE } = require('./orderController');

const HELP = [
  'Commands:',
  '  normal   create a new Normal order',
  '  vip      create a new VIP order',
  '  +bot     add a cooking bot',
  '  -bot     remove the newest cooking bot',
  '  status   show pending / complete orders and bots',
  '  help     show this help',
  '  quit     exit',
].join('\n');

const pad = (n) => String(n).padStart(2, '0');

function timestamp(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createLogger(write = (line) => process.stdout.write(`${line}\n`)) {
  return (message) => write(`[${timestamp()}] ${message}`);
}

function formatStatus({ pending, complete, bots }) {
  const orders = (list) => (list.length ? list.map((o) => `${o.type}#${o.id}`).join(', ') : '-');
  const botList = bots.length
    ? bots.map((b) => `#${b.id}(${b.state}${b.orderId ? ` order #${b.orderId}` : ''})`).join(', ')
    : '-';
  return `Status - PENDING: [${orders(pending)}] | COMPLETE: [${orders(complete)}] | Bots: [${botList}]`;
}

/** Executes one command line. Returns false when the session should end. */
function handleCommand(controller, log, line) {
  switch (line.trim().toLowerCase()) {
    case '':
      return true;
    case 'normal':
      controller.addOrder(ORDER_TYPE.NORMAL);
      return true;
    case 'vip':
      controller.addOrder(ORDER_TYPE.VIP);
      return true;
    case '+bot':
      controller.addBot();
      return true;
    case '-bot':
      if (!controller.removeBot()) log('No bot to remove');
      return true;
    case 'status':
      log(formatStatus(controller.status()));
      return true;
    case 'help':
      log(HELP);
      return true;
    case 'quit':
    case 'exit':
      return false;
    default:
      log(`Unknown command: "${line.trim()}". Type "help" for commands.`);
      return true;
  }
}

function runInteractive() {
  const log = createLogger();
  const controller = new OrderController({ onEvent: log });
  log('System initialized with 0 bots');
  log(HELP);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    if (handleCommand(controller, log, line)) rl.prompt();
    else rl.close();
  });
  rl.on('close', () => {
    controller.shutdown();
    log(formatStatus(controller.status()));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario covering every requirement; writes to stdout (redirected to result.txt). */
async function runDemo() {
  const log = createLogger();
  const controller = new OrderController({ onEvent: log });
  const step = async (command, waitMs = 1000) => {
    log(`> ${command}`);
    handleCommand(controller, log, command);
    await sleep(waitMs);
  };

  log("McDonald's Order Management System - Simulation Results");
  log('System initialized with 0 bots');
  await step('normal');
  await step('vip');
  await step('normal');
  await step('vip');
  await step('status');
  await step('+bot');
  await step('+bot', 3000);
  await step('status');
  await step('-bot', 1000); // newest bot busy: its order returns to PENDING
  await step('status');
  await sleep(10000); // remaining bot drains the queue
  await step('status');
  await step('vip');
  await sleep(10500);
  await step('status', 0);
  controller.shutdown();
  log('Simulation finished');
}

module.exports = { runInteractive, runDemo, handleCommand, formatStatus, timestamp };
