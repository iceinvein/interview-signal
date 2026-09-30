'use strict';

const readline = require('readline');
const { OrderController, NORMAL, VIP } = require('./orderController');
const { timestamp, formatStatus } = require('./format');

const HELP = `Commands:
  normal   add a New Normal Order
  vip      add a New VIP Order
  +bot     add a cooking bot
  -bot     remove the newest cooking bot
  status   show PENDING / PROCESSING / COMPLETE areas
  help     show this help
  quit     exit`;

/**
 * Runs one command against the controller. Returns false when the user wants to quit.
 * `print` writes a plain line of output (no timestamp).
 */
function execute(controller, line, print) {
  switch (line.trim().toLowerCase()) {
    case '':
      return true;
    case 'normal': controller.addOrder(NORMAL); return true;
    case 'vip': controller.addOrder(VIP); return true;
    case '+bot': controller.addBot(); return true;
    case '-bot':
      if (!controller.removeBot()) print('No bots to remove');
      return true;
    case 'status': print(formatStatus(controller.status())); return true;
    case 'help': print(HELP); return true;
    case 'quit': case 'exit': return false;
    default:
      print(`Unknown command "${line.trim()}". Type "help" for commands.`);
      return true;
  }
}

// Interactive prompt on stdin/stdout.
function runInteractive({ processingMs } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  const print = (text) => console.log(text);
  const controller = new OrderController({
    processingMs,
    onEvent: (msg) => {
      // Redraw the prompt so async bot events don't garble the input line.
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(`[${timestamp()}] ${msg}`);
      rl.prompt(true);
    },
  });

  console.log(`[${timestamp()}] System initialized with 0 bots`);
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    if (execute(controller, line, print)) rl.prompt();
    else rl.close();
  });
  rl.on('close', () => {
    controller.shutdown();
    process.exit(0);
  });
}

module.exports = { execute, runInteractive, HELP };
