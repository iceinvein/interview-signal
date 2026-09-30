import readline from 'node:readline';
import { OrderController, OrderType } from './orderController.js';
import { createLogger, formatStatus } from './logger.js';

const HELP = `Commands:
  n | normal   New Normal Order
  v | vip      New VIP Order
  + | +bot     Add a bot
  - | -bot     Remove the newest bot
  s | status   Show PENDING / COMPLETE / BOTS
  h | help     Show this help
  q | quit     Exit`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

// Clear the prompt line before async log output (e.g. an order completing) so it stays readable.
const print = (line) => {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(line);
  rl.prompt(true);
};

const controller = new OrderController({ log: createLogger(print) });

const commands = {
  n: () => controller.addOrder(OrderType.NORMAL),
  v: () => controller.addOrder(OrderType.VIP),
  '+': () => controller.addBot(),
  '-': () => controller.removeBot(),
  s: () => print(formatStatus(controller.getState())),
  h: () => print(HELP),
  q: () => rl.close(),
};
const aliases = { normal: 'n', vip: 'v', '+bot': '+', '-bot': '-', status: 's', help: 'h', quit: 'q', exit: 'q' };

console.log("McDonald's Order Controller - interactive mode\n" + HELP);
rl.prompt();

rl.on('line', (input) => {
  const key = input.trim().toLowerCase();
  const command = commands[aliases[key] ?? key];
  if (command) command();
  else if (key) print(`Unknown command "${key}". Type "h" for help.`);
  else rl.prompt(); // every command prints (and re-prompts) on its own
});

rl.on('close', () => {
  controller.shutdown();
  process.exit(0);
});
