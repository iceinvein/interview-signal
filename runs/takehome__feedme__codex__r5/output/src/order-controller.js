'use strict';

const PROCESSING_MS = 10_000;
const ORDER_TYPES = new Set(['NORMAL', 'VIP']);

class OrderController {
  constructor({
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
    onEvent = () => {},
  } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderId = 1001;
    this.nextBotId = 1;
    this.pending = [];
    this.processing = [];
    this.complete = [];
    this.bots = [];
  }

  addOrder(type) {
    if (!ORDER_TYPES.has(type)) {
      throw new Error('Order type must be NORMAL or VIP');
    }

    const order = {
      id: this.nextOrderId++,
      type,
      status: 'PENDING',
      createdAt: this.now(),
      startedAt: null,
      completedAt: null,
    };
    this.insertPending(order);
    this.emit('order-created', { orderId: order.id, orderType: type });
    this.dispatch();
    return { ...order };
  }

  addBot() {
    const bot = { id: this.nextBotId++, status: 'IDLE', order: null, timer: null };
    this.bots.push(bot);
    this.emit('bot-created', { botId: bot.id });
    this.dispatch();
    return bot.id;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) return null;

    if (bot.order) {
      this.clearTimer(bot.timer);
      const order = bot.order;
      this.processing.splice(this.processing.indexOf(order), 1);
      order.status = 'PENDING';
      order.startedAt = null;
      this.insertPending(order);
      this.emit('order-returned', { orderId: order.id, orderType: order.type, botId: bot.id });
    }

    this.emit('bot-removed', { botId: bot.id });
    this.dispatch();
    return bot.id;
  }

  insertPending(order) {
    // Original queue position follows priority and creation order, including after cancellation.
    this.pending.push(order);
    this.pending.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'VIP' ? -1 : 1;
      return a.id - b.id;
    });
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.status !== 'IDLE' || this.pending.length === 0) continue;

      const order = this.pending.shift();
      order.status = 'PROCESSING';
      order.startedAt = this.now();
      bot.status = 'PROCESSING';
      bot.order = order;
      this.processing.push(order);
      this.emit('order-started', { orderId: order.id, orderType: order.type, botId: bot.id });
      bot.timer = this.setTimer(() => this.finish(bot, order), PROCESSING_MS);
    }
  }

  finish(bot, order) {
    if (!this.bots.includes(bot) || bot.order !== order) return;

    bot.timer = null;
    bot.order = null;
    bot.status = 'IDLE';
    this.processing.splice(this.processing.indexOf(order), 1);
    order.status = 'COMPLETE';
    order.completedAt = this.now();
    this.complete.push(order);
    this.emit('order-completed', { orderId: order.id, orderType: order.type, botId: bot.id });
    this.dispatch();
    if (bot.status === 'IDLE') this.emit('bot-idle', { botId: bot.id });
  }

  getStatus() {
    return {
      pending: this.pending.map((order) => ({ ...order })),
      processing: this.processing.map((order) => ({ ...order })),
      complete: this.complete.map((order) => ({ ...order })),
      bots: this.bots.map((bot) => ({
        id: bot.id,
        status: bot.status,
        orderId: bot.order?.id ?? null,
      })),
    };
  }

  emit(type, details) {
    this.onEvent({ type, at: this.now(), ...details });
  }
}

module.exports = { OrderController, PROCESSING_MS };
