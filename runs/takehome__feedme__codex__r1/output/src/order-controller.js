'use strict';

const PROCESSING_MS = 10_000;

const realClock = {
  now: () => new Date(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

class OrderController {
  constructor({ clock = realClock, onEvent = () => {} } = {}) {
    this.clock = clock;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.completed = [];
    this.bots = [];
  }

  newOrder(type) {
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new Error('Order type must be VIP or NORMAL');
    }

    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.enqueue(order);
    this.emit(`Created ${type} order #${order.id} - PENDING`);
    this.dispatch();
    return { ...order };
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} created`);
    this.dispatch();
    if (!bot.order) this.emit(`Bot #${bot.id} is IDLE`);
    return bot.id;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.emit('No bot to remove');
      return null;
    }

    if (bot.order) {
      this.clock.clearTimeout(bot.timer);
      const order = bot.order;
      order.status = 'PENDING';
      this.enqueue(order);
      this.emit(`Bot #${bot.id} stopped ${order.type} order #${order.id}; order returned to PENDING`);
    }
    this.emit(`Bot #${bot.id} removed`);
    this.dispatch();
    return bot.id;
  }

  getStatus() {
    return {
      pending: this.pending.map((order) => ({ ...order })),
      processing: this.bots
        .filter((bot) => bot.order)
        .map((bot) => ({ botId: bot.id, order: { ...bot.order } })),
      completed: this.completed.map((order) => ({ ...order })),
      bots: this.bots.map((bot) => ({
        id: bot.id,
        status: bot.order ? 'PROCESSING' : 'IDLE',
        orderId: bot.order?.id ?? null,
      })),
    };
  }

  enqueue(order) {
    const index = this.pending.findIndex((queued) =>
      (order.type === 'VIP' && queued.type === 'NORMAL') ||
      (order.type === queued.type && order.id < queued.id));
    this.pending.splice(index === -1 ? this.pending.length : index, 0, order);
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      bot.order = order;
      this.emit(`Bot #${bot.id} picked up ${order.type} order #${order.id} - PROCESSING`);
      bot.timer = this.clock.setTimeout(() => this.complete(bot, order), PROCESSING_MS);
    }
  }

  complete(bot, order) {
    if (bot.order !== order || !this.bots.includes(bot)) return;
    bot.order = null;
    bot.timer = null;
    order.status = 'COMPLETE';
    this.completed.push(order);
    this.emit(`Bot #${bot.id} completed ${order.type} order #${order.id} - COMPLETE (10s)`);
    this.dispatch();
    if (!bot.order) this.emit(`Bot #${bot.id} is IDLE`);
  }

  emit(message) {
    this.onEvent({ time: this.clock.now(), message });
  }
}

module.exports = { OrderController, PROCESSING_MS };
