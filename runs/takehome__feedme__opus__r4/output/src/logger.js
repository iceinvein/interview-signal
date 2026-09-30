import { OrderType } from './orderController.js';

export const formatTime = (date = new Date()) =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');

const label = (order) => `${order.type} Order #${order.id}`;

/** Subscribes to controller events and writes one timestamped line per event. */
export function attachLogger(controller, write) {
  const log = (message) => write(`[${formatTime()}] ${message}`);

  controller.on('order:created', (order) => log(`Created ${label(order)} - Status: PENDING`));
  controller.on('bot:created', (bot) => log(`Bot #${bot.id} created - Status: ACTIVE`));
  controller.on('bot:idle', (bot) => log(`Bot #${bot.id} is now IDLE - No pending orders`));
  controller.on('order:picked', (bot, order) =>
    log(`Bot #${bot.id} picked up ${label(order)} - Status: PROCESSING`));
  controller.on('order:completed', (bot, order, elapsedMs) =>
    log(`Bot #${bot.id} completed ${label(order)} - Status: COMPLETE (Processing time: ${Math.round(elapsedMs / 1000)}s)`));
  controller.on('bot:destroyed', (bot, order) =>
    log(order ? `Bot #${bot.id} destroyed while processing ${label(order)}` : `Bot #${bot.id} destroyed while IDLE`));
  controller.on('order:returned', (order) => log(`${label(order)} returned to PENDING`));

  return log;
}

export function formatStatus({ pending, complete, bots }) {
  const ids = (orders) => orders.map((o) => `#${o.id}${o.type === OrderType.VIP ? '(VIP)' : ''}`).join(', ') || '-';
  const botList = bots.map((b) => `#${b.id} ${b.order ? `PROCESSING #${b.order.id}` : 'IDLE'}`).join(', ') || '-';
  const vipCount = complete.filter((o) => o.type === OrderType.VIP).length;
  return [
    `- Bots (${bots.length}): ${botList}`,
    `- PENDING (${pending.length}): ${ids(pending)}`,
    `- COMPLETE (${complete.length}, ${vipCount} VIP, ${complete.length - vipCount} Normal): ${ids(complete)}`,
  ].join('\n');
}
