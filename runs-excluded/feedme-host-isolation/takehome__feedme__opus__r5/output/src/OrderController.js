'use strict';

const ORDER_TYPE = Object.freeze({ NORMAL: 'NORMAL', VIP: 'VIP' });
const BOT_STATUS = Object.freeze({ IDLE: 'IDLE', PROCESSING: 'PROCESSING' });
const PROCESSING_TIME_MS = 10_000;

/**
 * Pending-queue ordering: VIP before Normal, then by order number (FIFO).
 * Because order numbers only increase, this also restores an interrupted
 * order to its original position when it is put back in the queue.
 */
function comparePriority(a, b) {
  const rank = (order) => (order.type === ORDER_TYPE.VIP ? 0 : 1);
  return rank(a) - rank(b) || a.id - b.id;
}

class OrderController {
  /**
   * @param {object}   [options]
   * @param {number}   [options.processingTimeMs] time a bot needs per order
   * @param {Function} [options.onEvent]          receives a human-readable message per state change
   * @param {object}   [options.timer]            { setTimeout, clearTimeout } – injectable for tests
   */
  constructor({ processingTimeMs = PROCESSING_TIME_MS, onEvent = () => {}, timer = globalThis } = {}) {
    this.processingTimeMs = processingTimeMs;
    this.onEvent = onEvent;
    this.timer = timer;

    this.pending = [];
    this.completed = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type = ORDER_TYPE.NORMAL) {
    if (!Object.values(ORDER_TYPE).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type };
    this.#enqueue(order);
    this.onEvent(`Created ${label(order)} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, status: BOT_STATUS.IDLE, order: null, timeoutHandle: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created`);
    this.#dispatch();
    return bot;
  }

  /** Removes the newest bot. Any order it was cooking goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.onEvent('No bots to remove');
      return null;
    }

    if (bot.order) {
      this.timer.clearTimeout(bot.timeoutHandle);
      const order = bot.order;
      this.#enqueue(order);
      this.onEvent(`Bot #${bot.id} destroyed while PROCESSING - ${label(order)} returned to PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    this.#dispatch();
    return bot;
  }

  getStatus() {
    return {
      bots: this.bots.map(({ id, status, order }) => ({ id, status, orderId: order ? order.id : null })),
      pending: this.pending.map((o) => ({ ...o })),
      completed: this.completed.map((o) => ({ ...o })),
    };
  }

  /** Cancels all running timers so the process can exit cleanly. */
  shutdown() {
    for (const bot of this.bots) this.timer.clearTimeout(bot.timeoutHandle);
  }

  #enqueue(order) {
    const index = this.pending.findIndex((queued) => comparePriority(order, queued) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  /** Hands the highest-priority pending orders to idle bots (oldest bot first). */
  #dispatch() {
    for (const bot of this.bots) {
      if (bot.status === BOT_STATUS.IDLE && this.pending.length > 0) {
        this.#startProcessing(bot, this.pending.shift());
      }
    }
  }

  #startProcessing(bot, order) {
    bot.status = BOT_STATUS.PROCESSING;
    bot.order = order;
    bot.timeoutHandle = this.timer.setTimeout(() => this.#finishProcessing(bot), this.processingTimeMs);
    this.onEvent(`Bot #${bot.id} picked up ${label(order)} - Status: PROCESSING`);
  }

  #finishProcessing(bot) {
    const order = bot.order;
    this.completed.push(order);
    bot.status = BOT_STATUS.IDLE;
    bot.order = null;
    bot.timeoutHandle = null;
    this.onEvent(
      `Bot #${bot.id} completed ${label(order)} - Status: COMPLETE (Processing time: ${this.processingTimeMs / 1000}s)`,
    );

    if (this.pending.length > 0) this.#startProcessing(bot, this.pending.shift());
    else this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
  }
}

function label(order) {
  return `${order.type === ORDER_TYPE.VIP ? 'VIP' : 'Normal'} Order #${order.id}`;
}

module.exports = { OrderController, ORDER_TYPE, BOT_STATUS, PROCESSING_TIME_MS };
