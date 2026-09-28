export type OrderType = "NORMAL" | "VIP";

export interface Order {
  id: number;
  type: OrderType;
}

export type BotView = { id: number; status: "IDLE" } | { id: number; status: "PROCESSING"; orderId: number };

export type ControllerEvent =
  | { kind: "orderCreated"; order: Order }
  | { kind: "botAdded"; botId: number }
  | { kind: "orderPicked"; botId: number; order: Order }
  | { kind: "orderCompleted"; botId: number; order: Order; processingMs: number }
  | { kind: "botIdle"; botId: number }
  | { kind: "botRemoved"; botId: number; returnedOrder?: Order };

interface Bot {
  id: number;
  job?: { order: Order; timer: ReturnType<typeof setTimeout> };
}

interface Options {
  processingMs: number;
  onEvent: (event: ControllerEvent) => void;
}

// VIP before normal; within a type, lower (older) order number first. New
// orders always carry the highest number, so this one rule both appends new
// orders to the back of their type and puts returned orders back in place.
function comesBefore(a: Order, b: Order): boolean {
  if (a.type !== b.type) return a.type === "VIP";
  return a.id < b.id;
}

export class OrderController {
  private readonly pending: Order[] = [];
  private readonly complete: Order[] = [];
  private readonly bots: Bot[] = [];
  private lastOrderId = 0;
  private lastBotId = 0;

  constructor(private readonly options: Options) {}

  addOrder(type: OrderType): Order {
    this.lastOrderId += 1;
    const order = { id: this.lastOrderId, type };
    this.insertPending(order);
    this.options.onEvent({ kind: "orderCreated", order });
    this.dispatch();
    return order;
  }

  addBot(): number {
    this.lastBotId += 1;
    const bot: Bot = { id: this.lastBotId };
    this.bots.push(bot);
    this.options.onEvent({ kind: "botAdded", botId: bot.id });
    this.dispatch();
    return bot.id;
  }

  /** Removes the newest bot; returns its id, or undefined when there is none. */
  removeBot(): number | undefined {
    const bot = this.bots.pop();
    if (!bot) return undefined;
    const returnedOrder = bot.job?.order;
    if (bot.job) {
      clearTimeout(bot.job.timer);
      this.insertPending(bot.job.order);
    }
    this.options.onEvent({ kind: "botRemoved", botId: bot.id, returnedOrder });
    return bot.id;
  }

  snapshot(): { pending: Order[]; complete: Order[]; bots: BotView[] } {
    return {
      pending: this.pending.map((order) => ({ ...order })),
      complete: this.complete.map((order) => ({ ...order })),
      bots: this.bots.map((bot): BotView =>
        bot.job ? { id: bot.id, status: "PROCESSING", orderId: bot.job.order.id } : { id: bot.id, status: "IDLE" },
      ),
    };
  }

  private insertPending(order: Order): void {
    const index = this.pending.findIndex((queued) => comesBefore(order, queued));
    if (index === -1) this.pending.push(order);
    else this.pending.splice(index, 0, order);
  }

  private dispatch(): void {
    for (const bot of this.bots) {
      if (bot.job) continue;
      const order = this.pending.shift();
      if (!order) return;
      this.start(bot, order);
    }
  }

  private start(bot: Bot, order: Order): void {
    const timer = setTimeout(() => this.finish(bot, order), this.options.processingMs);
    bot.job = { order, timer };
    this.options.onEvent({ kind: "orderPicked", botId: bot.id, order });
  }

  private finish(bot: Bot, order: Order): void {
    bot.job = undefined;
    this.complete.push(order);
    this.options.onEvent({ kind: "orderCompleted", botId: bot.id, order, processingMs: this.options.processingMs });
    const next = this.pending.shift();
    if (next) this.start(bot, next);
    else this.options.onEvent({ kind: "botIdle", botId: bot.id });
  }
}
