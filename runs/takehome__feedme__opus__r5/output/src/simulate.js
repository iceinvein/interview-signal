#!/usr/bin/env node
'use strict';

// Scripted, non-interactive run used by scripts/run.sh (and CI).
// Usage: node src/simulate.js <output-file>

const fs = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');
const { OrderController, OrderType } = require('./OrderController');
const { attachLogger, formatStatus } = require('./logger');

async function simulate(outputFile) {
  fs.writeFileSync(outputFile, '');
  const write = (line) => {
    console.log(line);
    fs.appendFileSync(outputFile, `${line}\n`);
  };

  const controller = new OrderController();
  write("McDonald's Order Management System - Simulation Results\n");
  const log = attachLogger(controller, write);
  const logStatus = () => formatStatus(controller.getStatus()).forEach((line) => log(line));

  log('System initialized with 0 bots');

  // Orders queue up with no bots: VIPs jump ahead of Normals, behind other VIPs.
  controller.addOrder(OrderType.NORMAL); // #1
  controller.addOrder(OrderType.VIP); // #2
  controller.addOrder(OrderType.NORMAL); // #3
  controller.addOrder(OrderType.VIP); // #4
  logStatus();

  // Two bots immediately pick up the two VIP orders.
  controller.addBot();
  controller.addBot();

  // Removing the newest bot mid-process returns VIP #4 to the front of PENDING.
  await sleep(3000);
  controller.removeBot();
  logStatus();

  // A new VIP queues behind the returned VIP #4, ahead of Normal orders.
  await sleep(1000);
  controller.addOrder(OrderType.VIP); // #5
  logStatus();

  // Bot #1 completes #2 at ~10s and picks #4; a new bot joins at ~11s and picks #5.
  await sleep(7000);
  controller.addBot();

  // Remaining orders drain, then bots go IDLE.
  await sleep(21000);
  logStatus();

  // An idle bot picks up a new order immediately.
  controller.addOrder(OrderType.NORMAL); // #6
  await sleep(1000);
  controller.removeBot(); // newest bot is idle
  await sleep(10000);

  const { completed, bots, pending } = controller.getStatus();
  const vipCount = completed.filter((o) => o.type === OrderType.VIP).length;
  write('\nFinal Status:');
  write(`- Total Orders Processed: ${completed.length} (${vipCount} VIP, ${completed.length - vipCount} Normal)`);
  write(`- Orders Completed: ${completed.length}`);
  write(`- Active Bots: ${bots.length}`);
  write(`- Pending Orders: ${pending.length}`);

  controller.shutdown();
}

const outputFile = process.argv[2] || 'result.txt';
simulate(outputFile).catch((err) => {
  console.error(err);
  process.exit(1);
});
