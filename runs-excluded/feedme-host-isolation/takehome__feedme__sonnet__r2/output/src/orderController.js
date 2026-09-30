'use strict';

const NORMAL = 'NORMAL';
const VIP = 'VIP';
const PENDING = 'PENDING';
const PROCESSING = 'PROCESSING';
const COMPLETE = 'COMPLETE';

const DEFAULT_PROCESSING_MS = 10000;

// VIP orders first, then by order number (i.e. arrival order).
const byPriority = (a, b) => (a.type === b.type ? a.id - b.id : a.type === VIP ? -1 : 1);

/**
 * Holds all order/bot state and the scheduling rules. Everything lives in memory.
 * Emits human readable events through the `onEvent` callback.
 */
class OrderController {
  constructor({ processingMs = DEFAULT_PROCESSING_MS, onEvent = () => {} } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
  }

  addOrder(type) {
    const order = { id: this.nextOrderId++, type, status: PENDING };
    this.pending.push(order);
    // Ids only increase, so sorting keeps VIP behind existing VIPs and ahead of Normals.
    this.pending.sort(byPriority);
    this.onEvent(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.onEvent(`Bot #${bot.id} created - Status: ACTIVE`);
    this.assign(bot);
    return bot;
  }

  // Destroys the newest bot; its in-flight order goes back to its rightful place in PENDING.
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;
    clearTimeout(bot.timer);
    if (bot.order) {
      const order = bot.order;
      order.status = PENDING;
      this.pending.push(order);
      this.pending.sort(byPriority);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${order.type} Order #${order.id} - Order returned to PENDING`);
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  // Hands pending orders to any idle bots.
  dispatch() {
    this.bots.forEach((bot) => this.assign(bot));
  }

  assign(bot) {
    if (bot.order) return;
    const order = this.pending.shift();
    if (!order) return;
    order.status = PROCESSING;
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.finish(bot), this.processingMs);
  }

  finish(bot) {
    const order = bot.order;
    order.status = COMPLETE;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    this.assign(bot);
    if (!bot.order) this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ bot: b.id, ...b.order })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, state: b.order ? 'BUSY' : 'IDLE' })),
    };
  }

  // Stops all timers so the process can exit.
  shutdown() {
    this.bots.forEach((bot) => clearTimeout(bot.timer));
  }
}

module.exports = { OrderController, NORMAL, VIP, PENDING, PROCESSING, COMPLETE };
