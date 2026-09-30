import readline from 'node:readline';
import { OrderController } from './order-controller.js';
import { ManualClock } from './manual-clock.js';

function timestamp(time) {
  return new Date(time).toISOString().slice(11, 19);
}

function writeLine(time, message) {
  process.stdout.write(`[${timestamp(time)}] ${message}\n`);
}

function describe(snapshot) {
  const orders = (list) => list.map(({ id, type }) => `${type} #${id}`).join(', ') || 'none';
  const processing = snapshot.processing.map(({ botId, order }) =>
    `bot #${botId}: ${order.type} #${order.id}`).join(', ') || 'none';
  const bots = snapshot.bots.map(({ id, status }) => `#${id} ${status}`).join(', ') || 'none';
  return `PENDING: ${orders(snapshot.pending)} | PROCESSING: ${processing} | COMPLETE: ${orders(snapshot.complete)} | BOTS: ${bots}`;
}

function runDemo() {
  const clock = new ManualClock();
  const controller = new OrderController({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent: ({ timestamp: time, message }) => writeLine(time, message),
  });
  const status = () => writeLine(clock.now(), describe(controller.snapshot()));

  writeLine(clock.now(), 'Order controller demonstration (simulated clock; each order takes 10 seconds)');
  controller.addOrder('NORMAL');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('VIP');
  status();
  controller.addBot();
  controller.addBot();
  clock.advance(2_000);
  controller.removeBot();
  status();
  clock.advance(38_000);
  status();
  controller.addOrder('NORMAL');
  clock.advance(10_000);
  controller.removeBot();
  status();
}

function runInteractive() {
  const controller = new OrderController({
    onEvent: ({ timestamp: time, message }) => writeLine(time, message),
  });
  const status = () => writeLine(Date.now(), describe(controller.snapshot()));
  const help = () => writeLine(Date.now(), 'Commands: normal, vip, + bot, - bot, status, help, quit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => {
    if (process.stdin.isTTY) {
      rl.setPrompt(`[${timestamp(Date.now())}] > `);
      rl.prompt();
    }
  };

  writeLine(Date.now(), 'Interactive order controller. Orders take 10 real seconds.');
  help();
  prompt();
  rl.on('line', (input) => {
    const command = input.trim().toLowerCase().replace(/\s+/g, ' ');
    switch (command) {
      case 'normal':
      case 'new normal order':
        controller.addOrder('NORMAL'); break;
      case 'vip':
      case 'new vip order':
        controller.addOrder('VIP'); break;
      case '+':
      case '+ bot':
        controller.addBot(); break;
      case '-':
      case '- bot':
        controller.removeBot(); break;
      case 'status':
        status(); break;
      case 'help':
        help(); break;
      case 'quit':
      case 'exit':
        writeLine(Date.now(), 'Goodbye');
        controller.stop();
        rl.close();
        return;
      default:
        writeLine(Date.now(), `Unknown command: ${input.trim()}. Type help.`);
    }
    prompt();
  });
}

if (process.argv[2] === '--demo') runDemo();
else if (process.argv.length === 2 || process.argv[2] === '--interactive') runInteractive();
else {
  process.stderr.write('Usage: node src/cli.js [--interactive|--demo]\n');
  process.exitCode = 1;
}
