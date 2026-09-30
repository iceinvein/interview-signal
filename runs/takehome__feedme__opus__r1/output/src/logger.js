import { formatTime } from './orderController.js';

export const createLogger =
  (write = console.log) =>
  (message) =>
    write(`[${formatTime()}] ${message}`);
