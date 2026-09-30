import { EventEmitter } from 'node:events';

export const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
export const OrderStatus = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETE: 'COMPLETE' });
export const PROCESSING_TIME_MS = 10_000;

// VIP orders first, then by order number. Because order numbers only ever
// increase, this also puts a returned order back in its original position.
const byPriority = (a, b) =>
  (b.type === OrderType.VIP) - (a.type === OrderType.VIP) || a.id - b.id;

/**
 * In-memory order controller. Owns the PENDING queue, the COMPLETE list and the bots.
 *
 * Events: order:created, order:picked, order:completed, order:returned,
 *         bot:created, bot:idle, bot:destroyed
 */
export class OrderController extends EventEmitter {
  pending = [];
  complete = [];
  bots = [];
  #nextOrderId;
  #nextBotId = 1;
  #processingTimeMs;

  constructor({ processingTimeMs = PROCESSING_TIME_MS, firstOrderId = 1001 } = {}) {
    super();
    this.#processingTimeMs = processingTimeMs;
    this.#nextOrderId = firstOrderId;
  }

  addOrder(type) {
    if (!Object.values(OrderType).includes(type)) throw new Error(`Unknown order type: ${type}`);
    const order = { id: this.#nextOrderId++, type, status: OrderStatus.PENDING };
    this.#enqueue(order);
    this.emit('order:created', order);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.#nextBotId++, order: null, timer: null, startedAt: null };
    this.bots.push(bot);
    this.emit('bot:created', bot);
    this.#work(bot);
    return bot;
  }

  /** Destroys the newest bot. Its in-progress order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    const order = bot.order;
    this.#stop(bot);
    this.emit('bot:destroyed', bot, order);
    if (order) {
      order.status = OrderStatus.PENDING;
      this.#enqueue(order);
      this.emit('order:returned', order);
      this.#dispatch();
    }
    return bot;
  }

  /** Cancels all running timers so the process can exit. */
  shutdown() {
    this.bots.forEach((bot) => this.#stop(bot));
  }

  #enqueue(order) {
    this.pending.push(order);
    this.pending.sort(byPriority);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (!bot.order) this.#work(bot);
    }
  }

  #work(bot) {
    const order = this.pending.shift();
    if (!order) {
      this.emit('bot:idle', bot);
      return;
    }
    order.status = OrderStatus.PROCESSING;
    bot.order = order;
    bot.startedAt = Date.now();
    bot.timer = setTimeout(() => this.#finish(bot), this.#processingTimeMs);
    this.emit('order:picked', bot, order);
  }

  #finish(bot) {
    const order = bot.order;
    const elapsedMs = Date.now() - bot.startedAt;
    this.#stop(bot);
    order.status = OrderStatus.COMPLETE;
    this.complete.push(order);
    this.emit('order:completed', bot, order, elapsedMs);
    this.#work(bot);
  }

  #stop(bot) {
    clearTimeout(bot.timer);
    bot.order = null;
    bot.timer = null;
    bot.startedAt = null;
  }
}
