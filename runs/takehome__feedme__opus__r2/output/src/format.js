'use strict';

const { ORDER_TYPE } = require('./OrderController');

const pad = (n) => String(n).padStart(2, '0');

function formatTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const listOrders = (orders) => orders.map((o) => `#${o.id}(${o.type})`).join(', ') || '-';

function formatStatus({ bots, pending, processing, completed }) {
  const vipCount = completed.filter((o) => o.type === ORDER_TYPE.VIP).length;
  const botList = bots.map((b) => `#${b.id}(${b.orderId ? `order #${b.orderId}` : 'IDLE'})`).join(', ') || '-';
  return [
    `Bots (${bots.length}): ${botList}`,
    `PENDING (${pending.length}): ${listOrders(pending)}`,
    `PROCESSING (${processing.length}): ${listOrders(processing)}`,
    `COMPLETE (${completed.length}, ${vipCount} VIP, ${completed.length - vipCount} Normal): ${listOrders(completed)}`,
  ];
}

module.exports = { formatTime, formatStatus };
