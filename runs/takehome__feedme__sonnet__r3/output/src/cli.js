'use strict';

const readline = require('node:readline');
const { OrderController, OrderType } = require('./orderController');

const HELP = `Commands:
  normal   New Normal Order
  vip      New VIP Order
  +bot     Add a bot
  -bot     Remove the newest bot
  status   Show PENDING / COMPLETE orders and bots
  help     Show this help
  quit     Exit`;

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatStatus({ pending, complete, bots }) {
  const orders = (list) => list.map((o) => `${o.type}#${o.id}`).join(', ');
  const botList = bots.map((b) => `#${b.id}(${b.order ? `cooking #${b.order}` : 'IDLE'})`).join(', ');
  return [`PENDING:  [${orders(pending)}]`, `COMPLETE: [${orders(complete)}]`, `BOTS:     [${botList}]`].join('\n');
}

/**
 * Executes one command line against the controller.
 * @returns {{ output?: string, quit?: boolean }}
 */
function execute(controller, line) {
  switch (line.trim().toLowerCase()) {
    case '':
      return {};
    case 'normal':
      controller.addOrder(OrderType.NORMAL);
      return {};
    case 'vip':
      controller.addOrder(OrderType.VIP);
      return {};
    case '+bot':
      controller.addBot();
      return {};
    case '-bot':
      if (!controller.removeBot()) return { output: 'No bots to remove' };
      return {};
    case 'status':
      return { output: formatStatus(controller.status()) };
    case 'help':
      return { output: HELP };
    case 'quit':
    case 'exit':
      return { quit: true };
    default:
      return { output: `Unknown command: "${line.trim()}". Type "help".` };
  }
}

function createController(write, options) {
  return new OrderController({ ...options, log: (message) => write(`[${timestamp()}] ${message}`) });
}

function runInteractive({ input = process.stdin, output = process.stdout } = {}) {
  const write = (text) => output.write(`${text}\n`);
  const controller = createController(write);
  const rl = readline.createInterface({ input, output, prompt: '> ' });

  write("McDonald's Order Controller");
  write(HELP);
  rl.prompt();

  rl.on('line', (line) => {
    const { output: text, quit } = execute(controller, line);
    if (text) write(text);
    if (quit) return rl.close();
    rl.prompt();
  });
  rl.on('close', () => controller.shutdown());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario covering every requirement; output goes to stdout. */
async function runDemo({ write = console.log, processingMs } = {}) {
  const controller = createController(write, { processingMs });
  const step = async (label, action, waitMs = 1000) => {
    write(`\n# ${label}`);
    action();
    await sleep(waitMs);
  };
  const wait = processingMs ?? 10_000;

  write("McDonald's Order Management System - Simulation Results\n");
  write(`[${timestamp()}] System initialized with 0 bots`);

  await step('Normal order, then VIP order jumps ahead, then another normal', () => {
    controller.addOrder(OrderType.NORMAL);
    controller.addOrder(OrderType.VIP);
    controller.addOrder(OrderType.NORMAL);
  });
  await step('Second VIP queues behind the first VIP', () => controller.addOrder(OrderType.VIP));
  await step('+Bot picks up the first VIP order', () => controller.addBot());
  await step('+Bot #2 picks up the next VIP order', () => controller.addBot());
  await step('-Bot removes bot #2; its order returns to PENDING', () => controller.removeBot());
  write(`\n${formatStatus(controller.status())}`);
  await step('Wait for bot #1 to work through the queue', () => {}, wait * 4 + 1000);
  await step('Bot is IDLE; new VIP order is picked up immediately', () => controller.addOrder(OrderType.VIP), wait + 1000);

  const { pending, complete, bots } = controller.status();
  write('\nFinal Status:');
  write(`- Orders Completed: ${complete.length}`);
  write(`- Pending Orders: ${pending.length}`);
  write(`- Active Bots: ${bots.length}`);
  controller.shutdown();
}

module.exports = { execute, formatStatus, runInteractive, runDemo, timestamp };
