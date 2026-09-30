'use strict';

/** Formats a Date as HH:MM:SS (24h, local time). */
function formatTime(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** Returns a function that writes "[HH:MM:SS] message" lines to every given sink. */
function createLogger(sinks, now = () => new Date()) {
  return (message) => {
    const line = `[${formatTime(now())}] ${message}`;
    for (const write of sinks) write(line);
  };
}

module.exports = { formatTime, createLogger };
