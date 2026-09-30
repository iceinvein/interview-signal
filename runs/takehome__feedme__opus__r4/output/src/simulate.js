'use strict';

// Non-interactive demo used by scripts/run.sh. Runs a fixed scenario in real
// time (10s per order) covering every requirement, then prints a summary.

const { OrderController, OrderType } = require('./orderController');
const { createLogger } = require('./logger');
const { printStatus } = require('./cli');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const log = createLogger();
  const controller = new OrderController({ log });

  console.log("McDonald's Order Management System - Simulation Results\n");
  log('System initialized with 0 bots');

  controller.addOrder(OrderType.NORMAL); // #1001
  controller.addOrder(OrderType.VIP); // #1002 jumps ahead of #1001
  controller.addOrder(OrderType.NORMAL); // #1003
  controller.addOrder(OrderType.VIP); // #1004 queues behind #1002
  printStatus(controller, log);

  await sleep(1000);
  controller.addBot(); // Bot #1 picks up VIP #1002
  controller.addBot(); // Bot #2 picks up VIP #1004

  await sleep(2000);
  controller.removeBot(); // Bot #2 destroyed, VIP #1004 back to the front of PENDING
  printStatus(controller, log);

  await sleep(1000);
  controller.addBot(); // Bot #3 picks up VIP #1004 again

  await sleep(8000); // Bot #1 finishes #1002, picks up #1001
  controller.addOrder(OrderType.VIP); // #1005 jumps ahead of Normal #1003

  // Wait until all orders are complete, then let the bots go IDLE.
  while (controller.pending.length > 0 || controller.bots.some((bot) => bot.order)) {
    await sleep(500);
  }
  controller.removeBot();
  controller.removeBot(); // no bots left
  controller.removeBot(); // nothing to remove

  const completed = controller.complete;
  const vipCount = completed.filter((o) => o.type === OrderType.VIP).length;
  console.log('\nFinal Status:');
  log(`Total Orders Processed: ${completed.length} (${vipCount} VIP, ${completed.length - vipCount} Normal)`);
  log(`Completion order: ${completed.map((o) => `#${o.id}`).join(', ')}`);
  log(`Active Bots: ${controller.bots.length}`);
  log(`Pending Orders: ${controller.pending.length}`);
}

main();
