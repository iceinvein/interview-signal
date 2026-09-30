// Scripted, non-interactive run used by scripts/run.sh (CI). Runs in real time.
import fs from 'node:fs';
import { OrderController, OrderType } from './orderController.js';
import { createLogger, formatStatus } from './logger.js';

const outputPath = process.argv[2] ?? 'result.txt';
const lines = ["McDonald's Order Management System - Simulation Results", ''];
const log = createLogger((line) => {
  lines.push(line);
  console.log(line);
});

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const controller = new OrderController({ log });

log('System initialized with 0 bots');
controller.addOrder(OrderType.NORMAL); // #1001
controller.addOrder(OrderType.VIP); // #1002 -> jumps ahead of #1001
controller.addOrder(OrderType.NORMAL); // #1003
controller.addBot(); // Bot 1 -> VIP #1002
controller.addBot(); // Bot 2 -> #1001
await sleep(3);
controller.addOrder(OrderType.VIP); // #1004 -> ahead of #1003
controller.addBot(); // Bot 3 -> VIP #1004
await sleep(2);
controller.removeBot(); // Bot 3 destroyed mid-process, #1004 back to front of PENDING
await sleep(6); // Bots 1 & 2 finish, pick up #1004 and #1003
await sleep(11); // Both finish, go IDLE
controller.removeBot(); // Bot 2 destroyed while IDLE
controller.addOrder(OrderType.NORMAL); // #1005 -> Bot 1
await sleep(11);

const state = controller.getState();
const count = (type) => state.complete.filter((o) => o.type === type).length;
lines.push(
  '',
  'Final Status:',
  formatStatus(state),
  `- Orders Completed: ${state.complete.length} (${count(OrderType.VIP)} VIP, ${count(OrderType.NORMAL)} Normal)`,
  `- Pending Orders: ${state.pending.length}`,
  `- Active Bots: ${state.bots.length}`,
);
controller.shutdown();
fs.writeFileSync(outputPath, lines.join('\n') + '\n');
console.log(`\nResult written to ${outputPath}`);
