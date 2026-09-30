'use strict';

const PROCESSING_MS = 10000;

/**
 * Order controller: owns the PENDING queue, the COMPLETE list and the bots.
 * Time and event output are injectable so the logic can be tested without waiting.
 */
class OrderController {
  constructor({ processingMs = PROCESSING_MS, setTimer = setTimeout, clearTimer = clearTimeout, onEvent = () => {} } = {}) {
    this.processingMs = processingMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  addOrder(type) {
    if (type !== 'NORMAL' && type !== 'VIP') throw new Error(`Unknown order type: ${type}`);
    const order = { id: this.nextOrderId++, type };
    this.insertPending(order);
    this.onEvent(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.dispatch();
    return order;
  }

  // Keeps the queue sorted by (VIP first, then order id), so a returned order regains its original spot.
  insertPending(order) {
    const rank = (o) => (o.type === 'VIP' ? 0 : 1);
    const index = this.pending.findIndex(
      (o) => rank(o) > rank(order) || (rank(o) === rank(order) && o.id > order.id)
    );
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this.dispatch();
    return bot;
  }

  removeBot() {
    const bot = this.bots.pop(); // newest bot
    if (!bot) return null;
    if (bot.order) {
      this.clearTimer(bot.timer);
      this.insertPending(bot.order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${bot.order.type} Order #${bot.order.id} - Order returned to PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

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
    this.onEvent(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = this.setTimer(() => this.finish(bot), this.processingMs);
  }

  finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE`);
    if (this.pending.length > 0) this.dispatch();
    else this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ bot: b.id, ...b.order })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'PROCESSING' : 'IDLE' })),
    };
  }

  /** Clear pending timers so the process can exit. */
  shutdown() {
    for (const bot of this.bots) if (bot.timer) this.clearTimer(bot.timer);
  }
}

module.exports = { OrderController, PROCESSING_MS };
