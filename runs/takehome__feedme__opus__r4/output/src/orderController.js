'use strict';

const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
const OrderStatus = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETE: 'COMPLETE' });
const BotStatus = Object.freeze({ IDLE: 'IDLE', PROCESSING: 'PROCESSING' });

const DEFAULT_PROCESSING_MS = 10_000;

/** Lower value = higher priority. */
const PRIORITY = { [OrderType.VIP]: 0, [OrderType.NORMAL]: 1 };

/**
 * Holds all in-memory state (pending/complete orders and bots) and drives
 * the order control flow. All output goes through the injected `log` callback.
 */
class OrderController {
  constructor({ log = () => {}, processingMs = DEFAULT_PROCESSING_MS } = {}) {
    this.log = log;
    this.processingMs = processingMs;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.nextOrderId = 1001;
    this.nextBotId = 1;
  }

  addOrder(type) {
    if (!Object.values(OrderType).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type, status: OrderStatus.PENDING };
    this.enqueue(order);
    this.log(`Created ${describe(order)} - Status: PENDING`);
    this.dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, status: BotStatus.IDLE, order: null, timer: null };
    this.bots.push(bot);
    this.log(`Bot #${bot.id} created`);
    this.dispatch();
    if (bot.status === BotStatus.IDLE) this.logIdle(bot);
    return bot;
  }

  /** Destroys the newest bot. Its in-progress order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.log('No bot to remove');
      return null;
    }
    if (bot.order) {
      clearTimeout(bot.timer);
      const order = bot.order;
      order.status = OrderStatus.PENDING;
      this.enqueue(order);
      this.log(`Bot #${bot.id} destroyed while processing ${describe(order)} - order returned to PENDING`);
    } else {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  /** Cancels all running timers so the process can exit cleanly. */
  shutdown() {
    for (const bot of this.bots) clearTimeout(bot.timer);
  }

  status() {
    return {
      pending: this.pending.map(describe),
      complete: this.complete.map(describe),
      bots: this.bots.map((b) => (b.order ? `Bot #${b.id}: PROCESSING #${b.order.id}` : `Bot #${b.id}: IDLE`)),
    };
  }

  /**
   * Inserts an order keeping the queue sorted by (priority, id). New orders
   * land behind all orders of the same type; returned orders go back to their
   * original position because ids are increasing.
   */
  enqueue(order) {
    const index = this.pending.findIndex((other) => compare(order, other) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  /** Assigns pending orders to idle bots, oldest bot first. */
  dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (bot.status === BotStatus.IDLE) this.startProcessing(bot, this.pending.shift());
    }
  }

  startProcessing(bot, order) {
    bot.status = BotStatus.PROCESSING;
    bot.order = order;
    order.status = OrderStatus.PROCESSING;
    this.log(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.finishProcessing(bot), this.processingMs);
  }

  finishProcessing(bot) {
    const order = bot.order;
    order.status = OrderStatus.COMPLETE;
    this.complete.push(order);
    bot.status = BotStatus.IDLE;
    bot.order = null;
    bot.timer = null;
    this.log(`Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    this.dispatch();
    if (bot.status === BotStatus.IDLE) this.logIdle(bot);
  }

  logIdle(bot) {
    this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
  }
}

function compare(a, b) {
  return PRIORITY[a.type] - PRIORITY[b.type] || a.id - b.id;
}

function describe(order) {
  return `${order.type} Order #${order.id}`;
}

module.exports = { OrderController, OrderType, OrderStatus, BotStatus, DEFAULT_PROCESSING_MS };
