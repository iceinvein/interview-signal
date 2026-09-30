'use strict';

const PROCESSING_MS = 10_000;
const TYPE = Object.freeze({ NORMAL: 'NORMAL', VIP: 'VIP' });

/**
 * In-memory order controller: a priority queue of pending orders
 * (VIP before NORMAL, FIFO within each type) served by a pool of cooking bots.
 */
class OrderController {
  /**
   * @param {object} [options]
   * @param {number} [options.processingMs] time a bot needs to cook one order
   * @param {(event: object) => void} [options.onEvent] notified of every state change
   */
  constructor({ processingMs = PROCESSING_MS, onEvent = () => {} } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.lastOrderId = 0;
    this.lastBotId = 0;
  }

  addOrder(type = TYPE.NORMAL) {
    if (!Object.values(TYPE).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: ++this.lastOrderId, type };
    this.#enqueue(order);
    this.onEvent({ type: 'ORDER_ADDED', order });
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: ++this.lastBotId, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent({ type: 'BOT_ADDED', bot });
    this.#assign(bot);
    return bot;
  }

  /** Destroys the newest bot; its in-flight order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;
    clearTimeout(bot.timer);
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    if (order) this.#enqueue(order);
    this.onEvent({ type: 'BOT_REMOVED', bot, order });
    return bot;
  }

  snapshot() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ bot: b.id, order: { ...b.order } })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, status: b.order ? 'BUSY' : 'IDLE' })),
    };
  }

  /** Stops all timers so the process can exit. */
  shutdown() {
    this.bots.forEach((bot) => clearTimeout(bot.timer));
  }

  // VIP orders go behind existing VIPs but ahead of NORMAL ones. Ids are
  // increasing, so a re-queued order lands back at its original position.
  #enqueue(order) {
    const rank = (o) => (o.type === TYPE.VIP ? 0 : 1);
    const index = this.pending.findIndex(
      (o) => rank(o) > rank(order) || (rank(o) === rank(order) && o.id > order.id),
    );
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    this.bots.filter((b) => !b.order).forEach((bot) => this.#assign(bot));
  }

  #assign(bot) {
    const order = this.pending.shift();
    if (!order) {
      this.onEvent({ type: 'BOT_IDLE', bot });
      return;
    }
    bot.order = order;
    this.onEvent({ type: 'ORDER_STARTED', bot, order });
    bot.timer = setTimeout(() => this.#finish(bot), this.processingMs);
  }

  #finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent({ type: 'ORDER_COMPLETED', bot, order });
    this.#assign(bot);
  }
}

module.exports = { OrderController, TYPE, PROCESSING_MS };
