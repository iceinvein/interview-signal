'use strict';

const pad = (n) => String(n).padStart(2, '0');

function formatTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const label = (order) => `${order.type === 'VIP' ? 'VIP' : 'Normal'} Order #${order.id}`;

/** Subscribes to controller events and writes one timestamped line per event. */
function attachLogger(controller, write = console.log) {
  const log = (message) => write(`[${formatTime()}] ${message}`);

  controller.on('orderCreated', (order) => log(`Created ${label(order)} - Status: PENDING`));
  controller.on('botCreated', (bot) => log(`Bot #${bot.id} created`));
  controller.on('orderPickedUp', (bot, order) => log(`Bot #${bot.id} picked up ${label(order)} - Status: PROCESSING`));
  controller.on('orderCompleted', (bot, order) =>
    log(`Bot #${bot.id} completed ${label(order)} - Status: COMPLETE (Processing time: ${controller.processingTimeMs / 1000}s)`),
  );
  controller.on('botIdle', (bot) => log(`Bot #${bot.id} is now IDLE - No pending orders`));
  controller.on('botDestroyed', (bot, order) =>
    log(
      order
        ? `Bot #${bot.id} destroyed while processing ${label(order)} - order returned to PENDING`
        : `Bot #${bot.id} destroyed while IDLE`,
    ),
  );

  return log;
}

function formatStatus(controller) {
  const { pending, processing, completed, bots } = controller.status();
  const orders = (list) => (list.length ? list.map(label).join(', ') : '-');
  return [
    `PENDING:    ${orders(pending)}`,
    `PROCESSING: ${processing.length ? processing.map((p) => `${label(p.order)} (Bot #${p.botId})`).join(', ') : '-'}`,
    `COMPLETE:   ${orders(completed)}`,
    `BOTS:       ${bots.length ? bots.map((b) => `#${b.id} ${b.state}`).join(', ') : '-'}`,
  ].join('\n');
}

module.exports = { formatTime, attachLogger, formatStatus };
