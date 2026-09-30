'use strict';

const { EventEmitter } = require('node:events');

const OrderType = Object.freeze({ NORMAL: 'NORMAL', VIP: 'VIP' });
const OrderStatus = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETE: 'COMPLETE' });

const DEFAULT_PROCESSING_MS = 10_000;

/**
 * In-memory order controller.
 *
 * Pending queue ordering: all VIP orders first, then all Normal orders;
 * within each group orders are sorted by order id (= arrival order).
 * Because ids are unique and increasing, the same rule both places new
 * orders correctly and returns an interrupted order to its original position.
 *
 * Emitted events (payload in parentheses):
 *   orderCreated(order), botCreated(bot), botDestroyed(bot, interruptedOrder),
 *   orderPickedUp(bot, order), orderCompleted(bot, order), botIdle(bot)
 */
class OrderController extends EventEmitter {
  constructor({ processingTimeMs = DEFAULT_PROCESSING_MS } = {}) {
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
    const order = { id: this.nextOrderId++, type, status: OrderStatus.PENDING };
    this.#enqueue(order);
    this.emit('orderCreated', order);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit('botCreated', bot);
    if (!this.#assignNext(bot)) this.emit('botIdle', bot);
    return bot;
  }

  /** Destroys the newest bot. Returns the removed bot, or null if there are none. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    const interrupted = bot.order;
    if (interrupted) {
      clearTimeout(bot.timer);
      bot.order = null;
      bot.timer = null;
      interrupted.status = OrderStatus.PENDING;
      this.#enqueue(interrupted);
    }
    this.emit('botDestroyed', bot, interrupted);
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ botId: b.id, order: { ...b.order } })),
      completed: this.completed.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'PROCESSING' : 'IDLE', orderId: b.order?.id ?? null })),
    };
  }

  isIdle() {
    return this.pending.length === 0 && this.bots.every((b) => !b.order);
  }

  #enqueue(order) {
    const rank = (o) => (o.type === OrderType.VIP ? 0 : 1);
    const index = this.pending.findIndex(
      (o) => rank(o) > rank(order) || (rank(o) === rank(order) && o.id > order.id),
    );
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (!bot.order) this.#assignNext(bot);
    }
  }

  /** Gives the bot the next pending order. Returns false if nothing is pending. */
  #assignNext(bot) {
    const order = this.pending.shift();
    if (!order) return false;

    order.status = OrderStatus.PROCESSING;
    bot.order = order;
    bot.timer = setTimeout(() => this.#complete(bot), this.processingTimeMs);
    this.emit('orderPickedUp', bot, order);
    return true;
  }

  #complete(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    order.status = OrderStatus.COMPLETE;
    this.completed.push(order);
    this.emit('orderCompleted', bot, order);
    if (!this.#assignNext(bot)) this.emit('botIdle', bot);
  }
}

module.exports = { OrderController, OrderType, OrderStatus, DEFAULT_PROCESSING_MS };
