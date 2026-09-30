'use strict';

const PROCESSING_MS = 10000;

/**
 * Manages pending/complete orders and a pool of cooking bots.
 * The clock is injectable (setTimeout/clearTimeout) so tests need no real waiting.
 * Every state change is reported through the `onEvent(message)` callback.
 */
class OrderController {
  constructor({
    processingMs = PROCESSING_MS,
    onEvent = () => {},
    timers = { setTimeout, clearTimeout },
  } = {}) {
    this.processingMs = processingMs;
    this.onEvent = onEvent;
    this.timers = timers;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  addOrder(vip = false) {
    const order = { id: this.nextOrderId++, vip };
    this.insertPending(order);
    this.onEvent(`Created ${label(order)} - Status: PENDING`);
    this.dispatch();
    return order;
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
    if (!bot) {
      this.onEvent('No bot to remove');
      return null;
    }
    if (bot.order) {
      this.timers.clearTimeout(bot.timer);
      this.insertPending(bot.order);
      this.onEvent(`Bot #${bot.id} destroyed while processing ${label(bot.order)} - returned to PENDING`);
      this.dispatch();
    } else {
      this.onEvent(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  status() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ bot: b.id, order: b.order.id })),
      complete: this.complete.map((o) => ({ ...o })),
      bots: this.bots.length,
      idleBots: this.bots.filter((b) => !b.order).length,
    };
  }

  // Keeps VIP orders ahead of normal ones, and FIFO (by id) within each group.
  // Using id as the tiebreaker also restores an interrupted order to its original slot.
  insertPending(order) {
    const index = this.pending.findIndex((o) => (order.vip && !o.vip) || (order.vip === o.vip && order.id < o.id));
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      this.startProcessing(bot, this.pending.shift());
    }
  }

  startProcessing(bot, order) {
    bot.order = order;
    this.onEvent(`Bot #${bot.id} picked up ${label(order)} - Status: PROCESSING`);
    bot.timer = this.timers.setTimeout(() => this.finish(bot), this.processingMs);
  }

  finish(bot) {
    const order = bot.order;
    bot.order = null;
    bot.timer = null;
    this.complete.push(order);
    this.onEvent(`Bot #${bot.id} completed ${label(order)} - Status: COMPLETE (Processing time: ${this.processingMs / 1000}s)`);
    if (this.pending.length > 0) {
      this.dispatch();
    } else {
      this.onEvent(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }
}

function label(order) {
  return `${order.vip ? 'VIP' : 'Normal'} Order #${order.id}`;
}

module.exports = { OrderController, PROCESSING_MS };
