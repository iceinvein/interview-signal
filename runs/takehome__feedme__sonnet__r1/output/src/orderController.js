'use strict';

const PROCESSING_MS = 10_000;

const OrderType = Object.freeze({ VIP: 'VIP', NORMAL: 'Normal' });

/**
 * Coordinates orders and cooking bots, entirely in memory.
 *
 * - PENDING is kept sorted: VIP orders first, then Normal, each by order number.
 *   This gives "VIP behind existing VIPs, ahead of Normals" and lets an
 *   interrupted order return to its original position by simple re-insertion.
 * - A bot handles one order at a time; each takes `processingMs`.
 * - Progress is reported through the `onEvent(message)` callback.
 */
class OrderController {
  constructor({ processingMs = PROCESSING_MS, onEvent = () => {} } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type };
    this.#insertPending(order);
    this.onEvent(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this.#assign(bot);
    return bot;
  }

  /** Destroys the newest bot; its in-flight order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    if (bot.order) {
      clearTimeout(bot.timer);
      const order = bot.order;
      this.#insertPending(order);
      this.onEvent(
        `Bot #${bot.id} destroyed while PROCESSING - ${order.type} Order #${order.id} returned to PENDING`
      );
      this.#dispatch(); // another idle bot may take it straight away
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({
        id: b.id,
        state: b.order ? 'PROCESSING' : 'IDLE',
        order: b.order ? b.order.id : null,
      })),
    };
  }

  #insertPending(order) {
    const rank = (o) => (o.type === OrderType.VIP ? 0 : 1);
    const index = this.pending.findIndex(
      (o) => rank(o) > rank(order) || (rank(o) === rank(order) && o.id > order.id)
    );
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) this.#assign(bot);
  }

  #assign(bot) {
    if (bot.order) return;
    const order = this.pending.shift();
    if (!order) {
      this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
      return;
    }
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.#finish(bot), this.processingMs);
  }

  #finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent(
      `Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`
    );
    this.#assign(bot);
  }
}

module.exports = { OrderController, OrderType, PROCESSING_MS };
