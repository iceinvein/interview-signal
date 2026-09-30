'use strict';

const ORDER_TYPE = Object.freeze({ NORMAL: 'Normal', VIP: 'VIP' });
const ORDER_STATUS = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETE: 'COMPLETE' });

const DEFAULT_PROCESSING_TIME_MS = 10_000;

// VIP orders come first; within the same type, lower (older) order id comes first.
function comparePriority(a, b) {
  const rank = (order) => (order.type === ORDER_TYPE.VIP ? 0 : 1);
  return rank(a) - rank(b) || a.id - b.id;
}

class OrderController {
  constructor({ processingTimeMs = DEFAULT_PROCESSING_TIME_MS, log = () => {}, firstOrderId = 1001 } = {}) {
    this.processingTimeMs = processingTimeMs;
    this.log = log;
    this.nextOrderId = firstOrderId;
    this.nextBotId = 1;
    this.pending = [];
    this.completed = [];
    this.bots = [];
  }

  addOrder(type) {
    if (!Object.values(ORDER_TYPE).includes(type)) {
      throw new Error(`Unknown order type: ${type}`);
    }
    const order = { id: this.nextOrderId++, type, status: ORDER_STATUS.PENDING };
    this.enqueue(order);
    this.log(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.dispatch();
    return order;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.log(`Bot #${bot.id} created`);
    if (!this.assignNextOrder(bot)) {
      this.log(`Bot #${bot.id} is IDLE - No pending orders`);
    }
    return bot;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.log('No bot to remove');
      return null;
    }
    if (bot.order) {
      clearTimeout(bot.timer);
      const order = bot.order;
      order.status = ORDER_STATUS.PENDING;
      this.enqueue(order);
      this.log(`Bot #${bot.id} destroyed while processing ${order.type} Order #${order.id} - Order returned to PENDING`);
    } else {
      this.log(`Bot #${bot.id} destroyed while IDLE`);
    }
    return bot;
  }

  // Stops all in-flight timers so the process can exit cleanly.
  shutdown() {
    for (const bot of this.bots) clearTimeout(bot.timer);
  }

  getStatus() {
    return {
      pending: this.pending.map((o) => ({ ...o })),
      processing: this.bots.filter((b) => b.order).map((b) => ({ botId: b.id, order: { ...b.order } })),
      completed: this.completed.map((o) => ({ ...o })),
      bots: this.bots.map((b) => ({ id: b.id, status: b.order ? 'PROCESSING' : 'IDLE', orderId: b.order?.id ?? null })),
    };
  }

  enqueue(order) {
    const index = this.pending.findIndex((queued) => comparePriority(order, queued) < 0);
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  // Hands pending orders to idle bots, oldest bot first.
  dispatch() {
    for (const bot of this.bots) {
      if (this.pending.length === 0) return;
      if (!bot.order) this.assignNextOrder(bot);
    }
  }

  assignNextOrder(bot) {
    const order = this.pending.shift();
    if (!order) return false;
    order.status = ORDER_STATUS.PROCESSING;
    bot.order = order;
    bot.timer = setTimeout(() => this.completeOrder(bot), this.processingTimeMs);
    this.log(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
    return true;
  }

  completeOrder(bot) {
    const order = bot.order;
    order.status = ORDER_STATUS.COMPLETE;
    this.completed.push(order);
    bot.order = null;
    bot.timer = null;
    this.log(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: ${this.processingTimeMs / 1000}s)`);
    if (!this.assignNextOrder(bot)) {
      this.log(`Bot #${bot.id} is now IDLE - No pending orders`);
    }
  }
}

module.exports = { OrderController, ORDER_TYPE, ORDER_STATUS, DEFAULT_PROCESSING_TIME_MS };
