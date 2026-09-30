import readline from 'node:readline';
import { OrderController, timestamp } from './order-controller.js';

if (process.argv.includes('--demo')) {
  await import('./demo.js');
} else {
  const controller = new OrderController({ log: console.log });
  const say = (message) => console.log(`[${timestamp(Date.now())}] ${message}`);
  const commands = 'Commands: normal, vip, + bot, - bot, status, help, exit';

  say(commands);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const prompt = () => {
    if (process.stdin.isTTY) {
      rl.setPrompt(`[${timestamp(Date.now())}] order> `);
      rl.prompt();
    }
  };

  rl.on('line', (line) => {
    const command = line.trim().toLowerCase();
    switch (command) {
      case 'normal': case 'new normal order': controller.newOrder('Normal'); break;
      case 'vip': case 'new vip order': controller.newOrder('VIP'); break;
      case '+ bot': case 'add bot': controller.addBot(); break;
      case '- bot': case 'remove bot': controller.removeBot(); break;
      case 'status': say(JSON.stringify(controller.status())); break;
      case 'help': say(commands); break;
      case 'exit': case 'quit': rl.close(); process.exit(0);
      case '': break;
      default: say(`Unknown command: ${line.trim()}. ${commands}`);
    }
    prompt();
  });

  prompt();
}
