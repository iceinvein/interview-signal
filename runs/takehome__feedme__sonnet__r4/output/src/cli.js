#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { OrderController, TYPE } = require('./orderController');
const { timestamp, describeEvent, formatStatus } = require('./format');

const HELP = `Commands:
  normal   add a new normal order
  vip      add a new VIP order
  +bot     add a cooking bot
  -bot     remove the newest cooking bot
  status   show pending / processing / complete orders and bots
  help     show this help
  quit     exit`;

const print = (message) => console.log(`[${timestamp()}] ${message}`);

const createController = (options = {}) =>
  new OrderController({ ...options, onEvent: (e) => print(describeEvent(e)) });

const commands = (controller) => ({
  normal: () => controller.addOrder(TYPE.NORMAL),
  vip: () => controller.addOrder(TYPE.VIP),
  '+bot': () => controller.addBot(),
  '-bot': () => (controller.removeBot() ? undefined : print('No bot to remove')),
  status: () => print(formatStatus(controller.snapshot())),
  help: () => console.log(HELP),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario covering every requirement; used by scripts/run.sh. */
async function runDemo() {
  const controller = createController();
  const cmd = commands(controller);
  const steps = [
    ['normal', 0], ['normal', 0], ['vip', 0], ['status', 0], // VIP jumps ahead of normals
    ['+bot', 1000], ['+bot', 1000], ['status', 0],           // both bots start immediately
    ['vip', 1000], ['-bot', 1000], ['status', 0],            // newest bot removed, its order re-queued
    ['+bot', 1000], ['status', 0],
  ];
  for (const [name, delay] of steps) {
    await sleep(delay);
    print(`> ${name}`);
    cmd[name]();
  }
  await sleep(controller.processingMs * 2 + 1000);
  print('> status');
  cmd.status();
  controller.shutdown();
}

function runInteractive() {
  const controller = createController();
  const cmd = commands(controller);
  const rl = readline.createInterface({ input: process.stdin, prompt: '> ' });
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    const name = line.trim().toLowerCase();
    if (name === 'quit' || name === 'exit') return rl.close();
    if (name) (cmd[name] || (() => print(`Unknown command: ${name}. Type "help".`)))();
    rl.prompt();
  });
  rl.on('close', () => {
    controller.shutdown();
    process.exit(0);
  });
}

if (require.main === module) {
  if (process.argv.includes('--demo')) runDemo();
  else runInteractive();
}

module.exports = { commands };
