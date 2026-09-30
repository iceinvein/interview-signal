export class OrderController {
  constructor({
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    onEvent = () => {},
    processingMs = 10_000,
  } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onEvent = onEvent;
    this.processingMs = processingMs;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.complete = [];
    this.bots = [];
  }

  addOrder(type) {
    if (type !== 'VIP' && type !== 'NORMAL') {
      throw new Error('Order type must be VIP or NORMAL');
    }

    const order = { id: this.nextOrderId++, type };
    this.insertPending(order);
    this.emit(`Created ${type} order #${order.id} - PENDING`);
    this.assignOrders();
    return order.id;
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null };
    this.bots.push(bot);
    this.emit(`Added bot #${bot.id}`);
    this.assignOrders();
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
      this.insertPending(bot.order);
      this.emit(`Removed bot #${bot.id}; ${bot.order.type} order #${bot.order.id} returned to PENDING`);
    } else {
      this.emit(`Removed idle bot #${bot.id}`);
    }
    this.assignOrders();
    return bot.id;
  }

  stop() {
    for (const bot of this.bots) {
      if (bot.timer !== null) this.clearTimer(bot.timer);
    }
  }

  snapshot() {
    return {
      pending: this.pending.map((order) => ({ ...order })),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({
        botId: bot.id,
        order: { ...bot.order },
      })),
      complete: this.complete.map((order) => ({ ...order })),
      bots: this.bots.map((bot) => ({ id: bot.id, status: bot.order ? 'BUSY' : 'IDLE' })),
    };
  }

  // IDs encode arrival order, including for orders returned by a removed bot.
  insertPending(order) {
    const position = this.pending.findIndex((queued) =>
      (order.type === 'VIP' && queued.type === 'NORMAL') ||
      (order.type === queued.type && order.id < queued.id));
    this.pending.splice(position === -1 ? this.pending.length : position, 0, order);
  }

  assignOrders() {
    for (const bot of this.bots) {
      if (bot.order || this.pending.length === 0) continue;
      bot.order = this.pending.shift();
      const order = bot.order;
      this.emit(`Bot #${bot.id} picked up ${order.type} order #${order.id} - PROCESSING`);
      bot.timer = this.setTimer(() => {
        // A removed bot's timer is cancelled; this guard also protects against
        // scheduler implementations that deliver an already queued callback.
        if (bot.order !== order || !this.bots.includes(bot)) return;
        bot.order = null;
        bot.timer = null;
        this.complete.push(order);
        this.emit(`Bot #${bot.id} completed ${order.type} order #${order.id} - COMPLETE (${this.processingMs / 1000}s)`);
        this.assignOrders();
        if (!bot.order) this.emit(`Bot #${bot.id} is IDLE`);
      }, this.processingMs);
    }
  }

  emit(message) {
    this.onEvent({ timestamp: this.now(), message });
  }
}
