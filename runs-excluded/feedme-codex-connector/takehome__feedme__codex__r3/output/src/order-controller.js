'use strict';

const PROCESSING_MS = 10_000;

class OrderController {
  constructor({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, onEvent = () => {} } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderNumber = 1001;
    this.nextBotNumber = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.closed = false;
  }

  emit(message) {
    this.onEvent({ at: this.now(), message });
  }

  assertOpen() {
    if (this.closed) throw new Error('Controller is closed');
  }

  // Within each priority, order number is the original FIFO position.
  enqueue(order) {
    order.status = 'PENDING';
    order.startedAt = null;
    const index = this.pending.findIndex(other =>
      (order.type === 'VIP' && other.type === 'Normal') ||
      (order.type === other.type && order.number < other.number)
    );
    this.pending.splice(index < 0 ? this.pending.length : index, 0, order);
  }

  newOrder(type) {
    this.assertOpen();
    if (type !== 'VIP' && type !== 'Normal') throw new Error('Order type must be VIP or Normal');
    const order = { number: this.nextOrderNumber++, type, status: 'PENDING', startedAt: null, completedAt: null };
    this.enqueue(order);
    this.emit(`${type} order #${order.number} created - PENDING`);
    this.dispatch();
    return order.number;
  }

  addBot() {
    this.assertOpen();
    const bot = { number: this.nextBotNumber++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.number} added - IDLE`);
    this.dispatch();
    return bot.number;
  }

  removeBot() {
    this.assertOpen();
    const bot = this.bots.pop();
    if (!bot) {
      this.emit('No bot to remove');
      return null;
    }
    if (bot.order) {
      this.clearTimer(bot.timer);
      const order = bot.order;
      bot.order = null;
      bot.timer = null;
      this.enqueue(order);
      this.emit(`Bot #${bot.number} removed; ${order.type} order #${order.number} returned to PENDING`);
      this.dispatch();
    } else {
      this.emit(`Bot #${bot.number} removed while IDLE`);
    }
    return bot.number;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      order.startedAt = this.now();
      bot.order = order;
      this.emit(`Bot #${bot.number} picked up ${order.type} order #${order.number} - PROCESSING`);
      bot.timer = this.setTimer(() => this.finish(bot, order), PROCESSING_MS);
    }
  }

  finish(bot, order) {
    if (this.closed || bot.order !== order) return;
    bot.order = null;
    bot.timer = null;
    order.status = 'COMPLETE';
    order.completedAt = this.now();
    this.complete.push(order);
    this.emit(`Bot #${bot.number} completed ${order.type} order #${order.number} - COMPLETE (${(order.completedAt - order.startedAt) / 1000}s)`);
    this.dispatch();
    if (!bot.order) this.emit(`Bot #${bot.number} is IDLE`);
  }

  snapshot() {
    return {
      pending: this.pending.map(order => ({ ...order })),
      processing: this.bots.filter(bot => bot.order).map(bot => ({ bot: bot.number, order: { ...bot.order } })),
      complete: this.complete.map(order => ({ ...order })),
      bots: this.bots.map(bot => ({ number: bot.number, status: bot.order ? 'PROCESSING' : 'IDLE' }))
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const bot of this.bots) if (bot.timer) this.clearTimer(bot.timer);
  }
}

module.exports = { OrderController, PROCESSING_MS };
