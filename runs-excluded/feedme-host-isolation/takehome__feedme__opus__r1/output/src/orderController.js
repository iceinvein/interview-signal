export const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
export const PROCESSING_TIME_MS = 10_000;

export function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

// VIP orders first, then by order number (which is always increasing).
// Using the same rule for new and returned orders keeps positions stable.
function comparePriority(a, b) {
  const rank = (order) => (order.type === OrderType.VIP ? 0 : 1);
  return rank(a) - rank(b) || a.id - b.id;
}

export class OrderController {
  #nextOrderId;
  #nextBotId = 1;
  #processingTimeMs;
  #log;
  #timers;

  pending = [];
  complete = [];
  bots = [];

  constructor({
    processingTimeMs = PROCESSING_TIME_MS,
    firstOrderId = 1001,
    log = () => {},
    timers = { setTimeout, clearTimeout },
  } = {}) {
    this.#processingTimeMs = processingTimeMs;
    this.#nextOrderId = firstOrderId;
    this.#log = log;
    this.#timers = timers;
  }

  addOrder(type = OrderType.NORMAL) {
    if (!Object.values(OrderType).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.#nextOrderId++, type };
    this.#enqueue(order);
    this.#log(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.#nextBotId++, order: null, timer: null, startedAt: null };
    this.bots.push(bot);
    this.#log(`Bot #${bot.id} created - Status: ACTIVE`);
    if (!this.#assignWork(bot)) this.#logIdle(bot);
    return bot;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.#log('No bots to remove');
      return null;
    }
    if (bot.order) {
      this.#timers.clearTimeout(bot.timer);
      this.#enqueue(bot.order);
      this.#log(
        `Bot #${bot.id} destroyed while PROCESSING - ${bot.order.type} Order #${bot.order.id} returned to PENDING`,
      );
    } else {
      this.#log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => `${o.type}#${o.id}`),
      complete: this.complete.map((o) => `${o.type}#${o.id}`),
      bots: this.bots.map((b) =>
        b.order ? `Bot#${b.id}(PROCESSING ${b.order.type}#${b.order.id})` : `Bot#${b.id}(IDLE)`,
      ),
    };
  }

  #enqueue(order) {
    const index = this.pending.findIndex((o) => comparePriority(order, o) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (!bot.order) this.#assignWork(bot);
    }
  }

  #assignWork(bot) {
    const order = this.pending.shift();
    if (!order) return false;
    bot.order = order;
    bot.startedAt = Date.now();
    bot.timer = this.#timers.setTimeout(() => this.#complete(bot), this.#processingTimeMs);
    this.#log(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    return true;
  }

  #complete(bot) {
    const { order } = bot;
    const seconds = Math.round((Date.now() - bot.startedAt) / 1000);
    bot.order = bot.timer = bot.startedAt = null;
    this.complete.push(order);
    this.#log(
      `Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${seconds}s)`,
    );
    if (!this.#assignWork(bot)) this.#logIdle(bot);
  }

  #logIdle(bot) {
    this.#log(`Bot #${bot.id} is now IDLE - No pending orders`);
  }
}
