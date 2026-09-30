'use strict';

const PROCESSING_MS = 10_000;

const OrderType = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });

/** VIP orders first, then by order number (i.e. arrival order). */
function byPriority(a, b) {
  if (a.type !== b.type) return a.type === OrderType.VIP ? -1 : 1;
  return a.id - b.id;
}

/**
 * Manages the PENDING / COMPLETE order areas and the pool of cooking bots.
 * Emits human readable events through the `log` callback.
 */
class OrderController {
  constructor({ processingMs = PROCESSING_MS, log = () => {} } = {}) {
    this.processingMs = processingMs;
    this.log = log;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type };
    this.pending.push(order);
    this.pending.sort(byPriority);
    this.log(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.log(`Bot #${bot.id} created - Status: ACTIVE`);
    this.dispatch();
    return bot;
  }

  /** Destroys the newest bot; its in-flight order returns to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.log('No bot to remove');
      return null;
    }
    if (bot.order) {
      clearTimeout(bot.timer);
      this.pending.push(bot.order);
      this.pending.sort(byPriority);
      this.log(`Bot #${bot.id} destroyed while processing ${describe(bot.order)} - returned to PENDING`);
      bot.order = null;
      this.dispatch();
    } else {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  /** Hands pending orders to idle bots. */
  dispatch() {
    for (const bot of this.bots) {
      if (bot.order) continue;
      const order = this.pending.shift();
      if (!order) return;
      this.startProcessing(bot, order);
    }
  }

  startProcessing(bot, order) {
    bot.order = order;
    this.log(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.finish(bot), this.processingMs);
  }

  finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.log(`Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    if (this.pending.length > 0) {
      this.startProcessing(bot, this.pending.shift());
    } else {
      this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }

  status() {
    return {
      bots: this.bots.map((b) => ({ id: b.id, order: b.order ? b.order.id : null })),
      pending: this.pending.map((o) => ({ ...o })),
      complete: this.complete.map((o) => ({ ...o })),
    };
  }

  /** Cancels all running timers so the process can exit. */
  shutdown() {
    this.bots.forEach((b) => clearTimeout(b.timer));
  }
}

function describe(order) {
  return `${order.type} Order #${order.id}`;
}

module.exports = { OrderController, OrderType, PROCESSING_MS };
