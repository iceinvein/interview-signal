'use strict';

const PROCESSING_MS = 10_000;

class OrderController {
  constructor({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, onEvent = () => {} } = {}) {
    this.now = now;
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
    this.onEvent(`[${new Date(this.now()).toISOString().slice(11, 19)}] ${message}`);
  }

  addOrder(type) {
    if (type !== 'VIP' && type !== 'Normal') {
      throw new Error('Order type must be VIP or Normal');
    }
    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.insertPending(order);
    this.emit(`${type} order #${order.id} created - PENDING`);
    this.dispatch();
    return order.id;
  }

  insertPending(order) {
    // Every order keeps its original place within its priority class, even if
    // a bot is removed while cooking it.
    const index = this.pending.findIndex(other =>
      (order.type === 'VIP' && other.type === 'Normal') ||
      (order.type === other.type && order.id < other.id));
    this.pending.splice(index < 0 ? this.pending.length : index, 0, order);
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} added`);
    this.dispatch();
    if (!bot.order) this.emit(`Bot #${bot.id} IDLE`);
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
      bot.order.status = 'PENDING';
      this.insertPending(bot.order);
      this.emit(`Bot #${bot.id} removed; ${bot.order.type} order #${bot.order.id} returned to PENDING`);
      bot.order = null;
      bot.timer = null;
      this.dispatch();
    } else {
      this.emit(`Bot #${bot.id} removed while IDLE`);
    }
    return bot.id;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      bot.order = order;
      this.emit(`Bot #${bot.id} picked up ${order.type} order #${order.id} - PROCESSING`);
      bot.timer = this.setTimer(() => {
        // The guard also protects against a timer callback already queued when
        // a bot is removed.
        if (bot.order !== order || !this.bots.includes(bot)) return;
        bot.order = null;
        bot.timer = null;
        order.status = 'COMPLETE';
        this.complete.push(order);
        this.emit(`Bot #${bot.id} completed ${order.type} order #${order.id} - COMPLETE (10 seconds)`);
        this.dispatch();
        if (!bot.order) this.emit(`Bot #${bot.id} IDLE`);
      }, PROCESSING_MS);
    }
  }

  status() {
    return {
      pending: this.pending.map(({ id, type }) => ({ id, type })),
      processing: this.bots.filter(bot => bot.order).map(bot => ({ botId: bot.id, orderId: bot.order.id, type: bot.order.type })),
      complete: this.complete.map(({ id, type }) => ({ id, type })),
      bots: this.bots.map(bot => ({ id: bot.id, status: bot.order ? 'PROCESSING' : 'IDLE' }))
    };
  }
}

module.exports = { OrderController, PROCESSING_MS };
