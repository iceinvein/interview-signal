const TEN_SECONDS = 10_000;

const realClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export function timestamp(milliseconds) {
  return new Date(milliseconds).toISOString().slice(11, 19);
}

export class OrderController {
  constructor({ clock = realClock, log = () => {} } = {}) {
    this.clock = clock;
    this.log = log;
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.pending = [];
    this.completed = [];
    this.bots = [];
    this.emit('System initialized with 0 bots');
  }

  emit(message) {
    this.log(`[${timestamp(this.clock.now())}] ${message}`);
  }

  newOrder(type) {
    if (type !== 'VIP' && type !== 'Normal') {
      throw new Error('Order type must be VIP or Normal');
    }

    const order = { id: this.nextOrderId++, type, status: 'PENDING' };
    this.insertPending(order);
    this.emit(`Created ${type} Order #${order.id} - Status: PENDING`);
    this.dispatch();
    return order.id;
  }

  // Order IDs preserve arrival order within each priority, including after cancellation.
  insertPending(order) {
    const before = this.pending.findIndex((queued) =>
      (order.type === 'VIP' && queued.type === 'Normal') ||
      (order.type === queued.type && order.id < queued.id));
    this.pending.splice(before === -1 ? this.pending.length : before, 0, order);
  }

  addBot() {
    const bot = { id: this.nextBotId++, order: null, timer: null, idleAnnounced: false };
    this.bots.push(bot);
    this.emit(`Bot #${bot.id} created`);
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
      this.clock.clearTimeout(bot.timer);
      bot.order.status = 'PENDING';
      this.insertPending(bot.order);
      this.emit(`Bot #${bot.id} stopped ${bot.order.type} Order #${bot.order.id}; order returned to PENDING`);
    }
    this.emit(`Bot #${bot.id} destroyed`);
    this.dispatch();
    return bot.id;
  }

  dispatch() {
    for (const bot of this.bots) {
      if (bot.order) continue;
      const order = this.pending.shift();
      if (!order) {
        if (!bot.idleAnnounced) {
          bot.idleAnnounced = true;
          this.emit(`Bot #${bot.id} is IDLE`);
        }
        continue;
      }

      bot.idleAnnounced = false;
      bot.order = order;
      order.status = 'PROCESSING';
      this.emit(`Bot #${bot.id} picked up ${order.type} Order #${order.id} - Status: PROCESSING`);
      bot.timer = this.clock.setTimeout(() => {
        // A cancelled timer must not complete an order, even if its callback was queued.
        if (bot.order !== order || !this.bots.includes(bot)) return;
        bot.order = null;
        bot.timer = null;
        order.status = 'COMPLETE';
        this.completed.push(order);
        this.emit(`Bot #${bot.id} completed ${order.type} Order #${order.id} - Status: COMPLETE (Processing time: 10s)`);
        this.dispatch();
      }, TEN_SECONDS);
    }
  }

  status() {
    const copyOrder = (order) => ({ id: order.id, type: order.type, status: order.status });
    return {
      pending: this.pending.map(copyOrder),
      processing: this.bots.filter((bot) => bot.order).map((bot) => ({
        botId: bot.id, ...copyOrder(bot.order),
      })),
      complete: this.completed.map(copyOrder),
      bots: this.bots.map((bot) => ({ id: bot.id, status: bot.order ? 'PROCESSING' : 'IDLE' })),
    };
  }
}
