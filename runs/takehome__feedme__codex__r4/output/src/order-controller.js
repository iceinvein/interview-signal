'use strict';

const PROCESSING_MS = 10_000;

class OrderController {
  constructor({ clock = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout, onEvent = () => {} } = {}) {
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  emit(message) {
    this.onEvent({ at: this.clock(), message });
  }

  // The order number also preserves each customer's original FIFO position.
  insertPending(order) {
    order.status = 'PENDING';
    const before = this.pending.findIndex((other) =>
      (order.type === 'VIP' && other.type === 'NORMAL') ||
      (order.type === other.type && order.id < other.id));
    this.pending.splice(before === -1 ? this.pending.length : before, 0, order);
  }

  addOrder(type) {
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new Error('Order type must be VIP or NORMAL');
    }
    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.insertPending(order);
    this.emit(`${type} order #${order.id} created: PENDING`);
    this.dispatch();
    return order.id;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} added: IDLE`);
    this.dispatch();
    return bot.id;
  }

  removeBot() {
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
      this.insertPending(order);
      this.emit(`Bot #${bot.id} removed; ${order.type} order #${order.id} returned: PENDING`);
    } else {
      this.emit(`Bot #${bot.id} removed: IDLE`);
    }
    this.dispatch();
    return bot.id;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      bot.order = order;
      this.emit(`Bot #${bot.id} picked up ${order.type} order #${order.id}: PROCESSING`);
      bot.timer = this.setTimer(() => {
        // Removed bots have their timer cancelled; this guard also protects
        // against a timer callback already queued when a bot is removed.
        if (bot.order !== order || !this.bots.includes(bot)) return;
        bot.order = null;
        bot.timer = null;
        order.status = 'COMPLETE';
        this.complete.push(order);
        this.emit(`Bot #${bot.id} completed ${order.type} order #${order.id}: COMPLETE (10s)`);
        this.dispatch();
        if (!bot.order) this.emit(`Bot #${bot.id}: IDLE`);
      }, PROCESSING_MS);
    }
  }

  getState() {
    return {
      pending: this.pending.map(({ id, type }) => ({ id, type })),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({
        botId: bot.id, orderId: bot.order.id, type: bot.order.type
      })),
      complete: this.complete.map(({ id, type }) => ({ id, type })),
      bots: this.bots.map((bot) => ({ id: bot.id, status: bot.order ? 'BUSY' : 'IDLE' }))
    };
  }

  shutdown() {
    for (const bot of this.bots) {
      if (bot.timer !== null) this.clearTimer(bot.timer);
    }
  }
}

module.exports = { OrderController, PROCESSING_MS };
