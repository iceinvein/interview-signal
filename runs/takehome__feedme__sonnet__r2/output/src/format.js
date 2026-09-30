'use strict';

const pad = (n) => String(n).padStart(2, '0');

function timestamp(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatStatus({ pending, processing, complete, bots }) {
  const label = (o) => `#${o.id}(${o.type})`;
  const list = (orders) => (orders.length ? orders.map(label).join(' ') : '-');
  const botList = bots.length ? bots.map((b) => `#${b.id}:${b.state}`).join(' ') : '-';
  return [
    `Bots       : ${botList}`,
    `PENDING    : ${list(pending)}`,
    `PROCESSING : ${processing.length ? processing.map((o) => `${label(o)} by bot #${o.bot}`).join(', ') : '-'}`,
    `COMPLETE   : ${list(complete)}`,
  ].join('\n');
}

module.exports = { timestamp, formatStatus };
