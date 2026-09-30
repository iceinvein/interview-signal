'use strict';

const PROCESSING_MS = 10_000;

class OrderController {
  constructor({
    durationMs = PROCESSING_MS,
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onEvent = () => {},
  } = {}) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError('durationMs must be positive');
    }
    this.durationMs = durationMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
    this.closed = false;
  }

  addOrder(type) {
    this.ensureOpen();
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new TypeError('Order type must be VIP or NORMAL');
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
    this.emit(`Order #${order.id} (${type}) created: PENDING`);
    this.dispatch();
    return order.id;
  }

  addBot() {
    this.ensureOpen();
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} added`);
    this.dispatch();
    if (bot.order === null) this.emit(`Bot #${bot.id}: IDLE`);
    return bot.id;
  }

  removeBot() {
    this.ensureOpen();
    const bot = this.bots.pop();
    if (!bot) {
      this.emit('No bot to remove');
      return null;
    }
    if (bot.order !== null) {
      this.clearTimer(bot.timer);
      const order = bot.order;
      order.status = 'PENDING';
      order.startedAt = null;
      this.insertPending(order);
      this.emit(`Bot #${bot.id} stopped; order #${order.id} returned to PENDING`);
    }
    this.emit(`Bot #${bot.id} removed`);
    this.dispatch();
    return bot.id;
  }

  // Within each priority, the order ID is the original submission position.
  // Reinserting a cancelled order therefore restores its place in the queue.
  insertPending(order) {
    const before = (other) =>
      order.type === other.type ? order.id < other.id : order.type === 'VIP';
    const index = this.pending.findIndex(before);
    this.pending.splice(index < 0 ? this.pending.length : index, 0, order);
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order !== null || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      order.startedAt = this.now();
      bot.order = order;
      this.emit(`Bot #${bot.id} picked up order #${order.id} (${order.type}): PROCESSING`);
      bot.timer = this.setTimer(() => this.finish(bot, order), this.durationMs);
    }
  }

  finish(bot, order) {
    if (this.closed || bot.order !== order || !this.bots.includes(bot)) return;
    bot.order = null;
    bot.timer = null;
    order.status = 'COMPLETE';
    order.completedAt = this.now();
    this.complete.push(order);
    this.emit(`Bot #${bot.id} completed order #${order.id} (${order.type}): COMPLETE`);
    this.dispatch();
    if (bot.order === null) this.emit(`Bot #${bot.id}: IDLE`);
  }

  snapshot() {
    return {
      pending: this.pending.map((order) => ({ id: order.id, type: order.type })),
      processing: this.bots
        .filter((bot) => bot.order !== null)
        .map((bot) => ({ botId: bot.id, id: bot.order.id, type: bot.order.type })),
      complete: this.complete.map((order) => ({
        id: order.id,
        type: order.type,
        completedAt: order.completedAt,
      })),
      bots: this.bots.map((bot) => ({
        id: bot.id,
        status: bot.order === null ? 'IDLE' : 'PROCESSING',
      })),
    };
  }

  emit(message) {
    this.onEvent({ at: this.now(), message });
  }

  ensureOpen() {
    if (this.closed) throw new Error('Controller is closed');
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const bot of this.bots) {
      if (bot.timer !== null) this.clearTimer(bot.timer);
    }
  }
}

module.exports = { OrderController, PROCESSING_MS };
