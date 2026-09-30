export const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
export const OrderStatus = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
});
export const BotStatus = Object.freeze({ IDLE: 'IDLE', PROCESSING: 'PROCESSING' });

export const DEFAULT_PROCESSING_TIME_MS = 10_000;

const priorityOf = (order) => (order.type === OrderType.VIP ? 0 : 1);

// Pending queue ordering: VIP before Normal, then by order number (arrival).
// Because order numbers only ever increase, this single rule covers both
// placing new orders and returning interrupted orders to their original spot.
const comparePending = (a, b) => priorityOf(a) - priorityOf(b) || a.id - b.id;

/**
 * In-memory order controller: owns the PENDING queue, the COMPLETE list and
 * the bot pool, and dispatches pending orders to idle bots.
 *
 * `onEvent(message)` is called for every state change so callers can decide
 * how to present it (console, file, tests).
 */
export class OrderController {
  constructor({
    processingTimeMs = DEFAULT_PROCESSING_TIME_MS,
    onEvent = () => {},
    firstOrderId = 1001,
  } = {}) {
    this.processingTimeMs = processingTimeMs;
    this.onEvent = onEvent;
    this.nextOrderId = firstOrderId;
    this.nextBotId = 1;
    this.pending = [];
    this.completed = [];
    this.bots = [];
  }

  addOrder(type) {
    if (!Object.values(OrderType).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type, status: OrderStatus.PENDING };
    this.#enqueue(order);
    this.onEvent(`Created ${describe(order)} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, status: BotStatus.IDLE, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this.#dispatch();
    if (bot.status === BotStatus.IDLE) {
      this.onEvent(`Bot #${bot.id} is IDLE - No pending orders`);
    }
    return bot;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.onEvent('No bots to remove');
      return null;
    }
    if (bot.order) {
      clearTimeout(bot.timer);
      const order = bot.order;
      order.status = OrderStatus.PENDING;
      this.#enqueue(order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${describe(order)} - order returned to PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  getStatus() {
    return {
      pending: this.pending.map(({ id, type }) => ({ id, type })),
      completed: this.completed.map(({ id, type }) => ({ id, type })),
      bots: this.bots.map((bot) => ({ id: bot.id, status: bot.status, orderId: bot.order?.id ?? null })),
    };
  }

  /** Cancels all running timers so the process can exit cleanly. */
  shutdown() {
    for (const bot of this.bots) clearTimeout(bot.timer);
  }

  #enqueue(order) {
    const index = this.pending.findIndex((other) => comparePending(order, other) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (bot.status === BotStatus.IDLE) this.#startProcessing(bot, this.pending.shift());
    }
  }

  #startProcessing(bot, order) {
    bot.status = BotStatus.PROCESSING;
    bot.order = order;
    order.status = OrderStatus.PROCESSING;
    bot.timer = setTimeout(() => this.#complete(bot), this.processingTimeMs);
    this.onEvent(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
  }

  #complete(bot) {
    const order = bot.order;
    order.status = OrderStatus.COMPLETE;
    this.completed.push(order);
    bot.status = BotStatus.IDLE;
    bot.order = null;
    bot.timer = null;
    this.onEvent(
      `Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE (Processing time: ${this.processingTimeMs / 1000}s)`,
    );
    this.#dispatch();
    if (bot.status === BotStatus.IDLE) {
      this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }
}

function describe(order) {
  return `${order.type} Order #${order.id}`;
}
