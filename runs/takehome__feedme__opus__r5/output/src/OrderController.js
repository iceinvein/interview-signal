'use strict';

const { EventEmitter } = require('node:events');

const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });

const DEFAULT_PROCESSING_TIME_MS = 10_000;

// VIP orders come before Normal orders; within a type, lower (older) id first.
function comparePriority(a, b) {
  const rank = (order) => (order.type === OrderType.VIP ? 0 : 1);
  return rank(a) - rank(b) || a.id - b.id;
}

/**
 * In-memory order controller.
 *
 * Emits: orderCreated, botCreated, botDestroyed, orderPickedUp,
 *        orderCompleted, orderReturned, botIdle
 */
class OrderController extends EventEmitter {
  constructor({ processingTimeMs = DEFAULT_PROCESSING_TIME_MS } = {}) {
    super();
    this.processingTimeMs = processingTimeMs;
    this.pending = [];
    this.completed = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type) {
    if (!Object.values(OrderType).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type };
    this.#enqueue(order);
    this.emit('orderCreated', order);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit('botCreated', bot);
    this.#dispatch();
    if (!bot.order) this.emit('botIdle', bot);
    return bot;
  }

  /** Removes the newest bot. Its in-progress order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    const order = bot.order;
    if (order) {
      clearTimeout(bot.timer);
      bot.order = null;
      bot.timer = null;
      this.#enqueue(order);
    }
    this.emit('botDestroyed', bot, order);
    if (order) this.emit('orderReturned', order);
    return bot;
  }

  getStatus() {
    return {
      pending: [...this.pending],
      processing: this.bots.filter((b) => b.order).map((b) => ({ botId: b.id, order: b.order })),
      completed: [...this.completed],
      bots: this.bots.map((b) => ({ id: b.id, status: b.order ? 'PROCESSING' : 'IDLE' })),
    };
  }

  /** Stops all running timers so the process can exit cleanly. */
  shutdown() {
    for (const bot of this.bots) clearTimeout(bot.timer);
  }

  // Keeps `pending` sorted by priority, so returned orders regain their original slot.
  #enqueue(order) {
    const index = this.pending.findIndex((o) => comparePriority(order, o) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (!bot.order) this.#startProcessing(bot, this.pending.shift());
    }
  }

  #startProcessing(bot, order) {
    bot.order = order;
    bot.timer = setTimeout(() => this.#finishProcessing(bot), this.processingTimeMs);
    this.emit('orderPickedUp', bot, order);
  }

  #finishProcessing(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.completed.push(order);
    this.emit('orderCompleted', bot, order);

    this.#dispatch();
    if (!bot.order) this.emit('botIdle', bot);
  }
}

module.exports = { OrderController, OrderType, DEFAULT_PROCESSING_TIME_MS };
