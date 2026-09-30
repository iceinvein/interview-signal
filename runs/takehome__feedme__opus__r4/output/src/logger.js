'use strict';

function formatTime(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** Returns a log function that prefixes each line with an `[HH:MM:SS]` timestamp. */
function createLogger(write = (line) => process.stdout.write(`${line}\n`)) {
  return (message) => write(`[${formatTime(new Date())}] ${message}`);
}

module.exports = { formatTime, createLogger };
