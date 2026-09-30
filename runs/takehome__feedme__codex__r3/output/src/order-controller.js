'use strict';

const PROCESSING_MS = 10_000;

class OrderController {
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onEvent = () => {} } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.completed = [];
    this.bots = [];
    this.emit('initialized', 'System initialized with 0 bots');
  }

  emit(type, message) {
    this.onEvent({ type, at: this.now(), message });
  }

  addOrder(type) {
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new Error('Order type must be VIP or NORMAL');
    }

    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.enqueue(order);
    this.emit('created', `Created ${type} Order #${order.id} - PENDING`);
    this.dispatch();
    return order.id;
  }

  // Order IDs are also arrival sequence numbers. Reinsert interrupted work by
  // priority and arrival time, so it regains its place among waiting orders.
  enqueue(order) {
    order.status = 'PENDING';
    const before = (waiting) =>
      (order.type === 'VIP' && waiting.type === 'NORMAL') ||
      (order.type === waiting.type && order.id < waiting.id);
    const index = this.pending.findIndex(before);
    this.pending.splice(index === -1 ? this.pending.length : index, 0, order);
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit('bot-added', `Bot #${bot.id} created - IDLE`);
    this.dispatch();
    return bot.id;
  }

  removeBot() {
    const bot = this.bots.pop();
    if (!bot) {
      this.emit('no-bot', 'No bot to remove');
      return null;
    }

    if (bot.order) {
      this.clearTimer(bot.timer);
      const order = bot.order;
      bot.order = null;
      bot.timer = null;
      this.enqueue(order);
      this.emit('interrupted', `Bot #${bot.id} stopped ${order.type} Order #${order.id} - returned to PENDING`);
    }
    this.emit('bot-removed', `Bot #${bot.id} destroyed`);
    this.dispatch();
    return bot.id;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;

      const order = this.pending.shift();
      order.status = 'PROCESSING';
      bot.order = order;
      this.emit('started', `Bot #${bot.id} picked up ${order.type} Order #${order.id} - PROCESSING`);
      bot.timer = this.setTimer(() => {
        // A canceled timer must never complete an interrupted order.
        if (bot.order !== order) return;
        bot.order = null;
        bot.timer = null;
        order.status = 'COMPLETE';
        this.completed.push(order);
        this.emit('completed', `Bot #${bot.id} completed ${order.type} Order #${order.id} - COMPLETE (10s)`);
        this.dispatch();
        if (!bot.order) this.emit('idle', `Bot #${bot.id} is IDLE`);
      }, PROCESSING_MS);
    }
  }

  getState() {
    const copyOrder = ({ id, type, status }) => ({ id, type, status });
    return {
      pending: this.pending.map(copyOrder),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({
        botId: bot.id,
        order: copyOrder(bot.order)
      })),
      complete: this.completed.map(copyOrder),
      bots: this.bots.map((bot) => ({
        id: bot.id,
        status: bot.order ? 'PROCESSING' : 'IDLE',
        orderId: bot.order?.id ?? null
      }))
    };
  }
}

module.exports = { OrderController, PROCESSING_MS };
