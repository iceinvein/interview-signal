'use strict';

const pad = (n) => String(n).padStart(2, '0');

const timestamp = (date = new Date()) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const label = (order) => `#${order.id} (${order.type})`;

const describeEvent = (e) => {
  switch (e.type) {
    case 'ORDER_ADDED': return `Order ${label(e.order)} added to PENDING`;
    case 'BOT_ADDED': return `Bot ${e.bot.id} added`;
    case 'BOT_REMOVED':
      return e.order
        ? `Bot ${e.bot.id} removed, order ${label(e.order)} returned to PENDING`
        : `Bot ${e.bot.id} removed`;
    case 'ORDER_STARTED': return `Bot ${e.bot.id} started order ${label(e.order)}`;
    case 'ORDER_COMPLETED': return `Bot ${e.bot.id} completed order ${label(e.order)}, moved to COMPLETE`;
    case 'BOT_IDLE': return `Bot ${e.bot.id} is IDLE`;
    default: return e.type;
  }
};

const formatStatus = (s) => {
  const ids = (orders) => `[${orders.map(label).join(', ')}]`;
  const bots = s.bots.map((b) => `${b.id}:${b.status}`).join(', ');
  const processing = s.processing.map((p) => `${label(p.order)}@bot${p.bot}`).join(', ');
  return `status: bots: [${bots}], pending: ${ids(s.pending)}, processing: [${processing}], complete: ${ids(s.complete)}`;
};

module.exports = { timestamp, describeEvent, formatStatus };
