export const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
export const BotStatus = Object.freeze({ IDLE: 'IDLE', PROCESSING: 'PROCESSING' });

export const PROCESSING_TIME_MS = 10_000;
const FIRST_ORDER_ID = 1001;

/**
 * In-memory order controller.
 *
 * - PENDING is kept sorted: VIP orders first, then Normal orders, each group by order id.
 *   Because ids are increasing, the same insert rule places new orders at the back of
 *   their group AND returns an interrupted order to its original position.
 * - Bots are kept in creation order; removing a bot always removes the newest.
 */
export class OrderController {
  #nextOrderId = FIRST_ORDER_ID;
  #nextBotId = 1;
  #pending = [];
  #complete = [];
  #bots = [];

  constructor({ processingTimeMs = PROCESSING_TIME_MS, log = () => {} } = {}) {
    this.processingTimeMs = processingTimeMs;
    this.log = log;
  }

  addOrder(type) {
    if (!Object.values(OrderType).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.#nextOrderId++, type };
    this.#enqueue(order);
    this.log(`Created ${describe(order)} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.#nextBotId++, status: BotStatus.IDLE, order: null, timer: null };
    this.#bots.push(bot);
    this.log(`Bot #${bot.id} created - Status: ACTIVE`);
    if (!this.#dispatch()) {
      this.log(`Bot #${bot.id} is IDLE - No pending orders`);
    }
    return bot;
  }

  removeBot() {
    const bot = this.#bots.pop();
    if (!bot) {
      this.log('No bots to remove');
      return null;
    }
    if (bot.order) {
      clearTimeout(bot.timer);
      this.#enqueue(bot.order);
      this.log(`Bot #${bot.id} destroyed while processing ${describe(bot.order)} - order returned to PENDING`);
    } else {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  getState() {
    return {
      pending: this.#pending.map((o) => ({ ...o })),
      complete: this.#complete.map((o) => ({ ...o })),
      bots: this.#bots.map(({ id, status, order }) => ({
        id,
        status,
        orderId: order ? order.id : null,
      })),
    };
  }

  /** Cancels all in-flight timers so the process can exit cleanly. */
  shutdown() {
    for (const bot of this.#bots) clearTimeout(bot.timer);
  }

  #enqueue(order) {
    const rank = (o) => (o.type === OrderType.VIP ? 0 : 1);
    const index = this.#pending.findIndex(
      (o) => rank(o) > rank(order) || (rank(o) === rank(order) && o.id > order.id),
    );
    if (index === -1) this.#pending.push(order);
    else this.#pending.splice(index, 0, order);
  }

  /** Assigns pending orders to idle bots. Returns true if any order was picked up. */
  #dispatch() {
    let assigned = false;
    for (const bot of this.#bots) {
      if (bot.status !== BotStatus.IDLE || this.#pending.length === 0) continue;
      this.#startProcessing(bot, this.#pending.shift());
      assigned = true;
    }
    return assigned;
  }

  #startProcessing(bot, order) {
    bot.status = BotStatus.PROCESSING;
    bot.order = order;
    bot.timer = setTimeout(() => this.#finishProcessing(bot), this.processingTimeMs);
    this.log(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
  }

  #finishProcessing(bot) {
    const order = bot.order;
    bot.status = BotStatus.IDLE;
    bot.order = null;
    bot.timer = null;
    this.#complete.push(order);
    this.log(
      `Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE ` +
        `(Processing time: ${this.processingTimeMs / 1000}s)`,
    );
    if (!this.#dispatch()) {
      this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }
}

function describe(order) {
  return `${order.type} Order #${order.id}`;
}
