'use strict';

const ORDER_TYPE = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
});
const DEFAULT_PROCESSING_TIME_MS = 10_000;
const FIRST_ORDER_ID = 1001;

// VIP orders go before Normal orders; within the same type, lower (older) id first.
function comparePriority(a, b) {
  const rank = (order) => (order.type === ORDER_TYPE.VIP ? 0 : 1);
  return rank(a) - rank(b) || a.id - b.id;
}

const describe = (order) => `${order.type} Order #${order.id}`;

class OrderController {
  constructor({ processingTimeMs = DEFAULT_PROCESSING_TIME_MS, log = () => {} } = {}) {
    this.processingTimeMs = processingTimeMs;
    this.log = log;
    this.pending = [];
    this.completed = [];
    this.bots = [];
    this.nextOrderId = FIRST_ORDER_ID;
    this.nextBotId = 1;
  }

  addOrder(type) {
    if (!Object.values(ORDER_TYPE).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type, status: ORDER_STATUS.PENDING };
    this.#enqueue(order);
    this.log(`Created ${describe(order)} - Status: PENDING`);
    this.#dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null, startedAt: null };
    this.bots.push(bot);
    this.log(`Bot #${bot.id} created - Status: ACTIVE`);
    this.#dispatch();
    if (!bot.order) this.log(`Bot #${bot.id} is IDLE - No pending orders`);
    return bot;
  }

  // Destroys the newest bot. An in-flight order goes back to PENDING at its priority position.
  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.log('No bot to remove');
      return null;
    }
    if (!bot.order) {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
      return bot;
    }
    const order = bot.order;
    this.#stop(bot);
    order.status = ORDER_STATUS.PENDING;
    this.#enqueue(order);
    this.log(`Bot #${bot.id} destroyed while processing ${describe(order)} - Order returned to PENDING`);
    this.#dispatch();
    return bot;
  }

  getStatus() {
    return {
      bots: this.bots.map((bot) => ({ id: bot.id, orderId: bot.order ? bot.order.id : null })),
      pending: this.pending.map((order) => ({ ...order })),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({ ...bot.order })),
      completed: this.completed.map((order) => ({ ...order })),
    };
  }

  // Clears all running timers so the process can exit cleanly.
  shutdown() {
    this.bots.forEach((bot) => this.#stop(bot));
  }

  #enqueue(order) {
    const index = this.pending.findIndex((queued) => comparePriority(order, queued) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  #dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (!bot.order) this.#startProcessing(bot, this.pending.shift());
    }
  }

  #startProcessing(bot, order) {
    bot.order = order;
    bot.startedAt = Date.now();
    order.status = ORDER_STATUS.PROCESSING;
    this.log(`Bot #${bot.id} picked up ${describe(order)} - Status: PROCESSING`);
    bot.timer = setTimeout(() => this.#complete(bot), this.processingTimeMs);
  }

  #complete(bot) {
    const order = bot.order;
    const elapsedSeconds = Math.round((Date.now() - bot.startedAt) / 1000);
    this.#stop(bot);
    order.status = ORDER_STATUS.COMPLETE;
    this.completed.push(order);
    this.log(
      `Bot #${bot.id} completed ${describe(order)} - Status: COMPLETE (Processing time: ${elapsedSeconds}s)`,
    );
    if (this.pending.length > 0) this.#startProcessing(bot, this.pending.shift());
    else this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
  }

  #stop(bot) {
    clearTimeout(bot.timer);
    bot.order = null;
    bot.timer = null;
    bot.startedAt = null;
  }
}

module.exports = { OrderController, ORDER_TYPE, ORDER_STATUS, DEFAULT_PROCESSING_TIME_MS };
