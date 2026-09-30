#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const readline = require('node:readline');
const { OrderController, OrderType } = require('./orderController');

const HELP = `Commands:
  normal   add a Normal order
  vip      add a VIP order
  +bot     add a bot
  -bot     remove the newest bot
  status   show bots, PENDING and COMPLETE areas
  help     show this help
  quit     exit`;

function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatStatus({ bots, pending, complete }) {
  const label = (o) => `${o.type[0]}#${o.id}`;
  const botText = bots.map((b) => `#${b.id}(${b.order ? `cooking #${b.order}` : 'IDLE'})`).join(', ');
  return [
    `Bots (${bots.length}): ${botText || '-'}`,
    `PENDING : ${pending.map(label).join(' ') || '-'}`,
    `COMPLETE: ${complete.map(label).join(' ') || '-'}`,
  ].join('\n');
}

function createSession({ out, processingMs }) {
  const emit = (msg) => out(`[${timestamp()}] ${msg}`);
  const controller = new OrderController({ processingMs, log: emit });

  const commands = {
    normal: () => controller.addOrder(OrderType.NORMAL),
    vip: () => controller.addOrder(OrderType.VIP),
    '+bot': () => controller.addBot(),
    '-bot': () => controller.removeBot(),
    status: () => formatStatus(controller.status()).split('\n').forEach(emit),
    help: () => out(HELP),
  };

  function run(line) {
    const name = line.trim().toLowerCase();
    if (!name) return;
    if (!commands[name]) return out(`Unknown command "${name}". Type "help".`);
    commands[name]();
  }

  return { controller, run, emit };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scripted scenario exercising every requirement; takes ~25s at 10s/order. */
async function runDemo(session, processingMs) {
  const { run, controller, emit } = session;
  const step = async (cmd, waitMs = 0) => {
    run(cmd);
    if (waitMs) await sleep(waitMs);
  };
  emit('System initialized with 0 bots');
  await step('normal');
  await step('normal');
  await step('vip');
  await step('vip');
  await step('status');
  await step('+bot', processingMs / 2);
  await step('+bot', processingMs / 4);
  await step('status');
  await step('-bot'); // newest bot's order returns to PENDING
  await step('status', processingMs * 2.5);
  await step('+bot');
  await step('normal', processingMs * 2);
  await step('status');
  await step('-bot');
  await step('-bot');
  const { pending, complete } = controller.status();
  emit(`Final: ${complete.length} completed, ${pending.length} pending`);
  controller.shutdown();
}

function runInteractive(session) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log(HELP);
  rl.prompt();
  rl.on('line', (line) => {
    if (line.trim().toLowerCase() === 'quit') return rl.close();
    session.run(line);
    rl.prompt();
  });
  rl.on('close', () => {
    session.controller.shutdown();
    process.exit(0);
  });
}

function parseArgs(argv) {
  const opts = { demo: false, output: null, processingMs: 10_000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--demo') opts.demo = true;
    else if (argv[i] === '--output') opts.output = argv[++i];
    else if (argv[i] === '--processing-ms') opts.processingMs = Number(argv[++i]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const file = opts.output ? fs.createWriteStream(opts.output) : null;
  const out = (line) => {
    console.log(line);
    if (file) file.write(`${line}\n`);
  };
  if (file) out("McDonald's Order Management System");
  const session = createSession({ out, processingMs: opts.processingMs });
  if (opts.demo) {
    await runDemo(session, opts.processingMs);
    if (file) file.end();
  } else {
    runInteractive(session);
  }
}

if (require.main === module) main();

module.exports = { timestamp, formatStatus, createSession };
