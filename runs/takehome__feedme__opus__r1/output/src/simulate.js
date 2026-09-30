// Scripted, non-interactive scenario used by scripts/run.sh to produce result.txt.
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { OrderController, OrderType } from './orderController.js';
import { createLogger } from './logger.js';

const lines = [];
const log = createLogger((line) => {
  lines.push(line);
  console.log(line);
});
const controller = new OrderController({ log });

lines.push("McDonald's Order Management System - Simulation Results", '');
log('System initialized with 0 bots');

controller.addOrder(OrderType.NORMAL); // #1001
controller.addOrder(OrderType.VIP); // #1002 -> jumps ahead of #1001
controller.addOrder(OrderType.NORMAL); // #1003
controller.addOrder(OrderType.VIP); // #1004 -> behind #1002, ahead of #1001
await sleep(1000);
controller.addBot(); // Bot #1 takes VIP #1002
controller.addBot(); // Bot #2 takes VIP #1004
await sleep(3000);
controller.removeBot(); // Bot #2 destroyed mid-process, VIP #1004 back to the front
await sleep(1000);
controller.addBot(); // Bot #3 picks VIP #1004 up again
await sleep(17_000); // Both bots finish, then work through the Normal orders
controller.addOrder(OrderType.VIP); // #1005 wakes the IDLE bot immediately
await sleep(15_000);
controller.removeBot(); // Newest bot destroyed while IDLE

const { pending, complete, bots } = controller.status();
const vip = controller.complete.filter((o) => o.type === OrderType.VIP).length;
lines.push(
  '',
  'Final Status:',
  `- Orders Completed: ${complete.length} (${vip} VIP, ${complete.length - vip} Normal)`,
  `- Completed Order Sequence: ${complete.join(', ')}`,
  `- Active Bots: ${bots.length}`,
  `- Pending Orders: ${pending.length}`,
);

await writeFile(process.argv[2] ?? 'result.txt', lines.join('\n') + '\n');
process.exit(0);
