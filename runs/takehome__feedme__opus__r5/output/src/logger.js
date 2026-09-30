'use strict';

function formatTime(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function formatOrder(order) {
  return `${order.type} Order #${order.id}`;
}

function formatStatus({ pending, processing, completed, bots }) {
  const list = (orders) => orders.map((o) => `#${o.id}(${o.type})`).join(', ') || '-';
  return [
    `PENDING:    ${list(pending)}`,
    `PROCESSING: ${processing.map((p) => `Bot #${p.botId} -> #${p.order.id}(${p.order.type})`).join(', ') || '-'}`,
    `COMPLETE:   ${list(completed)}`,
    `BOTS:       ${bots.map((b) => `#${b.id}(${b.status})`).join(', ') || '-'}`,
  ];
}

/**
 * Subscribes to controller events and writes timestamped lines via `write`.
 * Returns the `log` function so callers can emit their own timestamped lines.
 */
function attachLogger(controller, write, now = () => new Date()) {
  const log = (message) => write(`[${formatTime(now())}] ${message}`);
  const seconds = controller.processingTimeMs / 1000;

  controller.on('orderCreated', (order) => log(`Created ${formatOrder(order)} - Status: PENDING`));
  controller.on('botCreated', (bot) => log(`Bot #${bot.id} created`));
  controller.on('orderPickedUp', (bot, order) =>
    log(`Bot #${bot.id} picked up ${formatOrder(order)} - Status: PROCESSING`));
  controller.on('orderCompleted', (bot, order) =>
    log(`Bot #${bot.id} completed ${formatOrder(order)} - Status: COMPLETE (Processing time: ${seconds}s)`));
  controller.on('botIdle', (bot) => log(`Bot #${bot.id} is now IDLE - No pending orders`));
  controller.on('botDestroyed', (bot, order) =>
    log(order
      ? `Bot #${bot.id} destroyed while processing ${formatOrder(order)}`
      : `Bot #${bot.id} destroyed while IDLE`));
  controller.on('orderReturned', (order) => log(`${formatOrder(order)} returned to PENDING`));

  return log;
}

module.exports = { attachLogger, formatTime, formatStatus };
