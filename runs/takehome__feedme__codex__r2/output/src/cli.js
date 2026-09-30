import readline from 'node:readline';
import { OrderController } from './order-controller.js';

const stamp = () => new Date().toISOString().slice(11, 19);
const print = (message, timestamp = stamp()) => console.log(`[${timestamp}] ${message}`);
const controller = new OrderController({ onEvent: ({ timestamp, message }) => print(message, timestamp) });

function showStatus() {
  const { pending, processing, complete, bots } = controller.status();
  const orders = (items) => items.length
    ? items.map(({ id, type }) => `${type} #${id}`).join(', ')
    : '(none)';
  print(`PENDING: ${orders(pending)}`);
  print(`PROCESSING: ${processing.length ? processing.map((item) => `Bot #${item.botId} → ${item.type} #${item.orderId}`).join(', ') : '(none)'}`);
  print(`COMPLETE: ${orders(complete)}`);
  print(`BOTS: ${bots.length ? bots.map(({ id, status }) => `#${id} ${status}`).join(', ') : '(none)'}`);
}

function handleCommand(input) {
  const command = input.trim().toLowerCase();
  switch (command) {
    case 'normal': case 'new normal order': controller.addOrder('NORMAL'); break;
    case 'vip': case 'new vip order': controller.addOrder('VIP'); break;
    case '+': case '+ bot': controller.addBot(); break;
    case '-': case '- bot': controller.removeBot(); break;
    case 'status': showStatus(); break;
    case 'help': print('Commands: normal, vip, +, -, status, help, quit'); break;
    case 'quit': case 'exit': return false;
    case '': break;
    default: print(`Unknown command: ${input.trim()}. Type help.`);
  }
  return true;
}

async function demo() {
  print('Demo started');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  controller.addOrder('NORMAL');
  controller.addOrder('VIP');
  showStatus();
  controller.addBot();
  controller.addBot();
  controller.addBot();
  controller.removeBot(); // Interrupts the newest bot and returns its order.
  showStatus();
  await new Promise((resolve) => setTimeout(resolve, 20_100));
  showStatus();
  print('Demo finished');
  controller.stop();
}

function interactive() {
  print('Order controller ready. Type help for commands.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  if (process.stdin.isTTY) rl.setPrompt('> ');
  rl.on('line', (line) => {
    if (!handleCommand(line)) rl.close();
    else if (process.stdin.isTTY) rl.prompt();
  });
  rl.on('close', () => {
    controller.stop();
    print('Session ended');
  });
  if (process.stdin.isTTY) rl.prompt();
}

if (process.argv.includes('--demo')) await demo();
else interactive();
