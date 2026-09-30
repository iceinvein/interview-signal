'use strict';

const fs = require('fs');
const { OrderController, NORMAL, VIP } = require('./orderController');
const { timestamp, formatStatus } = require('./format');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scripted scenario that exercises every requirement. Output goes to stdout and `outputPath`.
 * Time is scaled by `processingMs` (10s in real use) so the scenario stays proportional.
 */
async function runDemo({ outputPath, processingMs = 10000 } = {}) {
  const lines = ["McDonald's Order Management System - Simulation Results", ''];
  const emit = (text) => {
    lines.push(text);
    console.log(text);
  };
  const log = (msg) => emit(`[${timestamp()}] ${msg}`);
  const unit = processingMs / 10; // "1 second" of scenario time

  const controller = new OrderController({ processingMs, onEvent: log });
  log('System initialized with 0 bots');

  controller.addOrder(NORMAL);          // #1
  controller.addOrder(VIP);             // #2 jumps ahead of #1
  controller.addOrder(NORMAL);          // #3
  controller.addOrder(VIP);             // #4 behind #2, ahead of #1 and #3
  emit(formatStatus(controller.status()));
  await sleep(unit);

  controller.addBot();                  // bot 1 takes VIP #2
  await sleep(unit);
  controller.addBot();                  // bot 2 takes VIP #4
  await sleep(unit * 2);
  controller.removeBot();               // bot 2 destroyed mid-order; #4 returns to the front
  emit(formatStatus(controller.status()));
  await sleep(unit);
  controller.addBot();                  // new bot 3 picks #4 straight back up
  await sleep(processingMs * 2 + unit); // drain the queue; bots go IDLE
  controller.addOrder(VIP);             // an idle bot picks it up immediately
  await sleep(processingMs + unit);

  emit('');
  emit('Final Status:');
  emit(formatStatus(controller.status()));
  controller.shutdown();

  if (outputPath) fs.writeFileSync(outputPath, lines.join('\n') + '\n');
}

module.exports = { runDemo };
