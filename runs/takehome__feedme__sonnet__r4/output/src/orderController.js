'use strict';

const PROCESSING_MS = 10000;

const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });

/**
 * Owns the pending/complete order lists and the bots that work on them.
 * All state is in memory. Timers and logging are injectable for testing.
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

  addNormalOrder() {
    return this.#addOrder(OrderType.NORMAL);
  }

  addVipOrder() {
    return this.#addOrder(OrderType.VIP);
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created`);
    this.#assignWork(bot);
    return bot;
  }

  /** Destroys the newest bot; its in-flight order goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;
    clearTimeout(bot.timer);
    if (bot.order) {
      const order = bot.order;
      bot.order = null;
      this.#enqueue(order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${describe(order)} - returned to PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'PROCESSING' : 'IDLE', orderId: b.order?.id ?? null })),
    };
  }

  /** Stops all timers so the process can exit. */
  shutdown() {
    this.bots.forEach((b) => clearTimeout(b.timer));
  }

  #addOrder(type) {
    const order = { id: this.nextOrderId++, type };
    this.#enqueue(order);
    this.onEvent(`Created ${describe(order)} - Status: PENDING`);
    this.#assignIdleBots();
    return order;
  }

  /** Inserts keeping VIP before Normal, and oldest first within each type. */
  #enqueue(order) {
    const isAhead = (o) => (o.type === order.type ? o.id < order.id : o.type === OrderType.VIP);
    let index = this.pending.length;
    while (index > 0 && !isAhead(this.pending[index - 1])) index--;
    this.pending.splice(index, 0, order);
  }

  #assignIdleBots() {
    this.bots.filter((b) => !b.order).forEach((b) => this.#assignWork(b));
  }

  #assignWork(bot) {
    const order = this.pending.shift();
    if (!order) {
      this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
      return;
    }
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.#finish(bot), this.processingMs);
  }

  #finish(bot) {
    const order = bot.order;
    bot.order = null;
    this.complete.push(order);
    this.onEvent(`Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE`);
    this.#assignWork(bot);
  }
}

function describe(order) {
  return `${order.type} Order #${order.id}`;
}

module.exports = { OrderController, OrderType, PROCESSING_MS };
