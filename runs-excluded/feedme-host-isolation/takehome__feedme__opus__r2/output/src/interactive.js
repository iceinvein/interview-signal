import readline from 'node:readline';
import { OrderController, OrderType } from './OrderController.js';
import { createLogger, formatStatus } from './logger.js';

const HELP = `Commands:
  n, normal   New Normal Order
  v, vip      New VIP Order
  +, +bot     Add a bot
  -, -bot     Remove the newest bot
  s, status   Show PENDING / COMPLETE / bots
  h, help     Show this help
  q, quit     Exit`;

export function runInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  let handlingCommand = false;
  let closed = false;
  // Timer-driven events arrive while the user may be typing, so clear the
  // prompt line, print the event, then redraw the prompt with the user's input.
  const log = createLogger((line) => {
    if (handlingCommand || closed) return console.log(line);
    if (process.stdout.isTTY) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    }
    console.log(line);
    rl.prompt(true);
  });
  const controller = new OrderController({ onEvent: log });

  const commands = {
    normal: () => controller.addOrder(OrderType.NORMAL),
    vip: () => controller.addOrder(OrderType.VIP),
    '+bot': () => controller.addBot(),
    '-bot': () => controller.removeBot(),
    status: () => console.log(formatStatus(controller.getStatus())),
    help: () => console.log(HELP),
    quit: () => rl.close(),
  };
  const aliases = { n: 'normal', v: 'vip', '+': '+bot', '-': '-bot', s: 'status', h: 'help', q: 'quit', exit: 'quit' };

  console.log(`McDonald's Order Controller (interactive)\n${HELP}`);
  rl.prompt();

  rl.on('line', (input) => {
    const name = input.trim().toLowerCase();
    const command = commands[aliases[name] ?? name];
    handlingCommand = true;
    if (command) command();
    else if (name) console.log(`Unknown command: ${name} (type "help")`);
    handlingCommand = false;
    if (!closed) rl.prompt();
  });

  rl.on('close', () => {
    closed = true;
    controller.shutdown();
    console.log('Bye!');
  });
}
