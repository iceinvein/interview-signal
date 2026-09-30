const pad = (n) => String(n).padStart(2, '0');

/** Formats a date as HH:MM:SS (local time). */
export function formatTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Returns a logger that prefixes each line with a [HH:MM:SS] timestamp. */
export function createLogger(write) {
  return (message) => write(`[${formatTime()}] ${message}`);
}

export function formatStatus({ pending, completed, bots }) {
  const orders = (list) => list.map((o) => `#${o.id}(${o.type})`).join(', ') || '-';
  const botList =
    bots.map((b) => `#${b.id} ${b.status}${b.orderId ? ` #${b.orderId}` : ''}`).join(', ') || '-';
  return [`PENDING:  ${orders(pending)}`, `COMPLETE: ${orders(completed)}`, `BOTS:     ${botList}`].join('\n');
}
