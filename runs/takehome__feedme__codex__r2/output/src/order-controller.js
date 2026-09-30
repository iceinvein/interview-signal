const TEN_SECONDS = 10_000;

const realClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class OrderController {
  constructor({ clock = realClock, onEvent = () => {} } = {}) {
    this.clock = clock;
    this.onEvent = onEvent;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  timestamp() {
    return new Date(this.clock.now()).toISOString().slice(11, 19);
  }

  emit(message) {
    this.onEvent({ timestamp: this.timestamp(), message });
  }

  addOrder(type) {
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new Error('Order type must be VIP or NORMAL');
    }

    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.insertPending(order);
    this.emit(`${type} order #${order.id} created: PENDING`);
    this.dispatch();
    return order;
  }

  // Order IDs preserve arrival order within each priority class, including returns.
  insertPending(order) {
    const before = this.pending.findIndex((queued) =>
      (order.type === 'VIP' && queued.type === 'NORMAL') ||
      (order.type === queued.type && order.id < queued.id));
    this.pending.splice(before === -1 ? this.pending.length : before, 0, order);
  }

  addBot() {
    const bot = { id: this.nextBotId++, status: 'IDLE', order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} added: IDLE`);
    this.dispatch();
    return bot;
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
      this.insertPending(order);
      this.emit(`Bot #${bot.id} removed; ${order.type} order #${order.id} returned: PENDING`);
    } else {
      this.emit(`Bot #${bot.id} removed: IDLE`);
    }
    bot.order = null;
    bot.timer = null;
    this.dispatch();
    return bot;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      const order = this.pending.shift();
      order.status = 'PROCESSING';
      bot.order = order;
      bot.status = 'PROCESSING';
      this.emit(`Bot #${bot.id} picked up ${order.type} order #${order.id}: PROCESSING`);
      bot.timer = this.clock.setTimeout(() => this.finish(bot, order), TEN_SECONDS);
    }
  }

  finish(bot, order) {
    // A removed bot cannot complete an interrupted order.
    if (bot.order !== order || !this.bots.includes(bot)) return;
    bot.order = null;
    bot.timer = null;
    bot.status = 'IDLE';
    order.status = 'COMPLETE';
    this.complete.push(order);
    this.emit(`Bot #${bot.id} completed ${order.type} order #${order.id}: COMPLETE (10s)`);
    this.dispatch();
    if (!bot.order) this.emit(`Bot #${bot.id} is IDLE`);
  }

  status() {
    return {
      pending: this.pending.map(({ id, type }) => ({ id, type })),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({
        botId: bot.id, orderId: bot.order.id, type: bot.order.type,
      })),
      complete: this.complete.map(({ id, type }) => ({ id, type })),
      bots: this.bots.map(({ id, status }) => ({ id, status })),
    };
  }

  stop() {
    for (const bot of this.bots) {
      if (bot.timer !== null) this.clock.clearTimeout(bot.timer);
    }
  }
}
