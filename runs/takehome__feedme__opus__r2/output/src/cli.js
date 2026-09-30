'use strict';

const readline = require('node:readline');
const { setTimeout: sleep } = require('node:timers/promises');
const { OrderController, ORDER_TYPE } = require('./OrderController');
const { formatTime, formatStatus } = require('./format');

const HELP = [
  'Commands:',
  '  n | normal     New Normal Order',
  '  v | vip        New VIP Order',
  '  + | +bot       Add a bot',
  '  - | -bot       Remove the newest bot',
  '  s | status     Show bots, PENDING, PROCESSING and COMPLETE areas',
  '  wait <sec>     Pause command input (useful for scripted runs)',
  '  h | help       Show this help',
  '  q | quit       Exit',
];

// Reads commands line by line from stdin. Works both interactively (TTY) and with piped input,
// so the same program powers the interactive demo and the scripted run in CI.
async function main({ input = process.stdin, output = process.stdout } = {}) {
  const interactive = Boolean(input.isTTY);
  let showPrompt = interactive;
  const rl = readline.createInterface({ input, output: interactive ? output : undefined, terminal: interactive });

  const print = (line) => {
    if (interactive) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
    }
    output.write(`[${formatTime()}] ${line}\n`);
    if (showPrompt) rl.prompt(true);
  };

  const controller = new OrderController({ log: print });
  const commands = {
    normal: () => controller.addOrder(ORDER_TYPE.NORMAL),
    vip: () => controller.addOrder(ORDER_TYPE.VIP),
    '+bot': () => controller.addBot(),
    '-bot': () => controller.removeBot(),
    status: () => formatStatus(controller.getStatus()).forEach(print),
    help: () => HELP.forEach((line) => output.write(`${line}\n`)),
  };
  const aliases = { n: 'normal', v: 'vip', '+': '+bot', '-': '-bot', s: 'status', h: 'help', q: 'quit' };

  output.write("McDonald's Order Management System\n");
  print(`System initialized with 0 bots${interactive ? " - type 'help' for commands" : ''}`);
  rl.setPrompt('> ');
  if (showPrompt) rl.prompt();

  for await (const rawLine of rl) {
    const [word = '', arg] = rawLine.trim().toLowerCase().split(/\s+/);
    const command = aliases[word] || word;

    if (command === '' || command.startsWith('#')) {
      // Blank line or comment in a scenario file.
    } else if (command === 'quit') {
      break;
    } else if (command === 'wait') {
      const seconds = Number(arg);
      if (Number.isFinite(seconds) && seconds >= 0) await sleep(seconds * 1000);
      else print(`Invalid wait duration: ${arg}`);
    } else if (commands[command]) {
      commands[command]();
    } else {
      print(`Unknown command: ${rawLine.trim()} (type 'help')`);
    }
    if (showPrompt) rl.prompt();
  }

  showPrompt = false;
  output.write('\nFinal Status:\n');
  formatStatus(controller.getStatus()).forEach(print);
  controller.shutdown();
  rl.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
