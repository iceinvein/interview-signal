const pad = (n) => String(n).padStart(2, '0');

export function timestamp(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Returns a log function that prefixes each line with [HH:MM:SS] and passes it to `write`. */
export function createLogger(write) {
  return (message) => write(`[${timestamp()}] ${message}`);
}

export function formatStatus({ pending, complete, bots }) {
  const orders = (list) => list.map((o) => `#${o.id}(${o.type})`).join(', ') || '-';
  const botList =
    bots.map((b) => `#${b.id} ${b.status}${b.orderId ? ` on #${b.orderId}` : ''}`).join(', ') || '-';
  return [`PENDING:  ${orders(pending)}`, `COMPLETE: ${orders(complete)}`, `BOTS:     ${botList}`].join('\n');
}
