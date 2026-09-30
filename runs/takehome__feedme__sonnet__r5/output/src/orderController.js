'use strict';

const ORDER_TYPE = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
const ORDER_STATUS = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETE: 'COMPLETE' });
const PROCESSING_MS = 10000;

/**
 * Manages the order queue and the pool of cooking bots.
 * All state is in memory. Timers and logging are injectable so the
 * controller can be tested without waiting real time.
 */
class OrderController {
  constructor({ processingMs = PROCESSING_MS, onEvent = () => {}, timers = { setTimeout, clearTimeout } } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.timers = timers;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type, status: ORDER_STATUS.PENDING };
    this._enqueue(order);
    this.onEvent(`Created ${type} Order #${order.id} - Status: PENDING`);
    this._dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this._dispatch();
    return bot;
  }

  /** Destroys the newest bot; its in-flight order (if any) goes back to PENDING. */
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    if (bot.order) {
      this.timers.clearTimeout(bot.timer);
      const order = bot.order;
      order.status = ORDER_STATUS.PENDING;
      this._enqueue(order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${order.type} Order #${order.id} - returned to PENDING`);
      this._dispatch();
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'PROCESSING' : 'IDLE', orderId: b.order ? b.order.id : null })),
    };
  }

  /** Cancels all running timers so the process can exit. */
  shutdown() {
    this.bots.forEach((bot) => this.timers.clearTimeout(bot.timer));
  }

  /** VIP before Normal; within the same type, ascending order number (FIFO). */
  _enqueue(order) {
    const isBehind = (other) =>
      other.type === order.type ? other.id > order.id : order.type === ORDER_TYPE.VIP;
    const index = this.pending.findIndex(isBehind);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  _dispatch() {
    for (const bot of this.bots) {
      if (bot.order) continue;
      const order = this.pending.shift();
      if (!order) {
        this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
        return;
      }
      this._startProcessing(bot, order);
    }
  }

  _startProcessing(bot, order) {
    order.status = ORDER_STATUS.PROCESSING;
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = this.timers.setTimeout(() => this._finish(bot, order), this.processingMs);
  }

  _finish(bot, order) {
    order.status = ORDER_STATUS.COMPLETE;
    this.complete.push(order);
    bot.order = null;
    bot.timer = null;
    this.onEvent(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    this._dispatch();
  }
}

module.exports = { OrderController, ORDER_TYPE, ORDER_STATUS, PROCESSING_MS };
