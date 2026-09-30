'use strict';

const PROCESSING_MS = 10_000;

const OrderType = Object.freeze({ VIP: 'VIP', NORMAL: 'Normal' });

/**
 * Coordinates orders and cooking bots. All state is in memory.
 *
 * Pending orders are kept sorted by (VIP first, then order number), which gives
 * "behind existing VIP, ahead of all Normal" for new VIP orders and lets an
 * order interrupted by "- Bot" go back to exactly its original position.
 */
class OrderController {
  /**
   * @param {object} [options]
   * @param {number} [options.processingMs] time a bot needs per order
   * @param {(message: string) => void} [options.log] receives event messages
   */
  constructor({ processingMs = PROCESSING_MS, log = () => {} } = {}) {
    this.processingMs = processingMs;
    this.log = log;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type };
    this.#insertPending(order);
    this.log(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.log(`Bot #${bot.id} created - Status: ACTIVE`);
    this.#dispatch();
    return bot;
  }

  /** Destroys the newest bot; its in-flight order (if any) returns to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    clearTimeout(bot.timer);
    if (bot.order) {
      this.#insertPending(bot.order);
      this.log(`Bot #${bot.id} destroyed while processing ${bot.order.type} Order #${bot.order.id} - Status: PENDING`);
    } else {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, order: b.order ? b.order.id : null })),
    };
  }

  /** Stops all timers so the process can exit. */
  shutdown() {
    this.bots.forEach((bot) => clearTimeout(bot.timer));
  }

  #insertPending(order) {
    const isBefore = (a, b) => (a.type === b.type ? a.id < b.id : a.type === OrderType.VIP);
    const index = this.pending.findIndex((other) => isBefore(order, other));
    this.pending.splice(index === -1 ? this.pending.length : index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (bot.order) continue;
      const order = this.pending.shift();
      if (!order) return;
      this.#startProcessing(bot, order);
    }
  }

  #startProcessing(bot, order) {
    bot.order = order;
    this.log(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.#finish(bot), this.processingMs);
  }

  #finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.log(
      `Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`,
    );

    if (this.pending.length > 0) {
      this.#startProcessing(bot, this.pending.shift());
    } else {
      this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }
}

module.exports = { OrderController, OrderType, PROCESSING_MS };
