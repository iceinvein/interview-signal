'use strict';

const PROCESSING_MS = 10000;

const NORMAL = 'NORMAL';
const VIP = 'VIP';

// VIP orders first, then by order number (i.e. arrival order).
function byPriority(a, b) {
  if (a.type !== b.type) return a.type === VIP ? -1 : 1;
  return a.id - b.id;
}

class OrderController {
  constructor({ processingMs = PROCESSING_MS, onEvent = () => {} } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = []; // oldest first; the newest bot is last
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type };
    this._enqueue(order);
    this.onEvent(`Created ${type} Order #${order.id} - Status: PENDING`);
    this._dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this._assign(bot);
    return bot;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;
    if (bot.order) {
      clearTimeout(bot.timer);
      this._enqueue(bot.order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${bot.order.type} Order #${bot.order.id} - Status: PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ bot: b.id, ...b.order })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'PROCESSING' : 'IDLE' })),
    };
  }

  // Stops all timers so the process can exit.
  shutdown() {
    this.bots.forEach((b) => clearTimeout(b.timer));
  }

  _enqueue(order) {
    const index = this.pending.findIndex((o) => byPriority(order, o) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  _dispatch() {
    this.bots.filter((b) => !b.order).forEach((b) => this._assign(b));
  }

  _assign(bot) {
    const order = this.pending.shift();
    if (!order) {
      this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
      return;
    }
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this._finish(bot), this.processingMs);
  }

  _finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    this._assign(bot);
  }
}

module.exports = { OrderController, NORMAL, VIP, PROCESSING_MS };
