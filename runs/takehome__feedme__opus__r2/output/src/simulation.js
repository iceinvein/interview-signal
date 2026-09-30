import { OrderController, OrderType } from './OrderController.js';
import { createLogger, formatStatus } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scripted, real-time run of the controller covering every requirement:
 * VIP priority, bot pickup, idling, and removing a bot mid-order.
 */
export async function runSimulation(write = console.log) {
  const log = createLogger(write);
  const controller = new OrderController({ onEvent: log });

  write("McDonald's Order Management System - Simulation Results\n");
  log('System initialized with 0 bots');

  controller.addOrder(OrderType.NORMAL); // #1001
  controller.addOrder(OrderType.VIP); // #1002
  controller.addOrder(OrderType.NORMAL); // #1003
  controller.addBot(); // Bot #1 -> VIP #1002
  controller.addBot(); // Bot #2 -> Normal #1001

  await sleep(1000);
  controller.addOrder(OrderType.VIP); // #1004 queues ahead of Normal #1003

  await sleep(2000);
  controller.removeBot(); // Bot #2 drops #1001, which returns behind VIP #1004

  await sleep(9000);
  controller.addBot(); // Bot #3 picks up the returned Normal #1001

  await sleep(20000);
  controller.removeBot(); // Bot #3 is idle by now

  const status = controller.getStatus();
  const vip = status.completed.filter((o) => o.type === OrderType.VIP).length;
  write('\nFinal Status:');
  write(formatStatus(status));
  write(`- Total Orders Completed: ${status.completed.length} (${vip} VIP, ${status.completed.length - vip} Normal)`);
  write(`- Pending Orders: ${status.pending.length}`);
  write(`- Active Bots: ${status.bots.length}`);

  controller.shutdown();
}
