import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderController } from "../src/orderController.js";

const TEN_SECONDS = 10_000;

function pendingIds(controller: OrderController): number[] {
  return controller.snapshot().pending.map((order) => order.id);
}

function completeIds(controller: OrderController): number[] {
  return controller.snapshot().complete.map((order) => order.id);
}

describe("OrderController", () => {
  let controller: OrderController;

  beforeEach(() => {
    vi.useFakeTimers();
    controller = new OrderController({ processingMs: TEN_SECONDS, onEvent: () => {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts a new normal order in PENDING", () => {
    const order = controller.addOrder("NORMAL");
    expect(controller.snapshot().pending).toEqual([{ id: order.id, type: "NORMAL" }]);
  });

  it("queues a VIP order behind existing VIP orders and ahead of normal orders", () => {
    controller.addOrder("NORMAL"); // 1
    controller.addOrder("VIP"); // 2
    controller.addOrder("NORMAL"); // 3
    controller.addOrder("VIP"); // 4
    expect(pendingIds(controller)).toEqual([2, 4, 1, 3]);
  });

  it("gives every order a unique, increasing number across both types", () => {
    const ids = [
      controller.addOrder("NORMAL").id,
      controller.addOrder("VIP").id,
      controller.addOrder("NORMAL").id,
    ];
    expect(ids).toEqual([1, 2, 3]);
  });

  it("starts processing the first pending order as soon as a bot is added", () => {
    controller.addOrder("NORMAL");
    controller.addOrder("VIP");
    controller.addBot();
    expect(controller.snapshot().bots).toEqual([{ id: 1, status: "PROCESSING", orderId: 2 }]);
    expect(pendingIds(controller)).toEqual([1]);
  });

  it("moves an order to COMPLETE exactly 10 seconds after pickup", () => {
    controller.addOrder("NORMAL");
    controller.addBot();
    vi.advanceTimersByTime(TEN_SECONDS - 1);
    expect(completeIds(controller)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(completeIds(controller)).toEqual([1]);
  });

  it("has a bot pick up the next pending order after completing one", () => {
    controller.addOrder("NORMAL");
    controller.addOrder("NORMAL");
    controller.addBot();
    vi.advanceTimersByTime(TEN_SECONDS);
    expect(controller.snapshot().bots).toEqual([{ id: 1, status: "PROCESSING", orderId: 2 }]);
  });

  it("leaves a bot IDLE when nothing is pending", () => {
    controller.addOrder("NORMAL");
    controller.addBot();
    vi.advanceTimersByTime(TEN_SECONDS);
    expect(controller.snapshot().bots).toEqual([{ id: 1, status: "IDLE" }]);
  });

  it("has an idle bot pick up a new order immediately", () => {
    controller.addBot();
    controller.addOrder("VIP");
    expect(controller.snapshot().bots).toEqual([{ id: 1, status: "PROCESSING", orderId: 1 }]);
  });

  it("removes the newest bot", () => {
    controller.addBot();
    controller.addBot();
    expect(controller.removeBot()).toBe(2);
    expect(controller.snapshot().bots.map((bot) => bot.id)).toEqual([1]);
  });

  it("returns a removed bot's order to its original place in PENDING", () => {
    controller.addOrder("VIP"); // 1
    controller.addOrder("NORMAL"); // 2
    controller.addOrder("NORMAL"); // 3
    controller.addBot(); // takes 1
    controller.addBot(); // takes 2
    controller.addOrder("VIP"); // 4
    controller.removeBot(); // bot 2 drops order 2
    expect(pendingIds(controller)).toEqual([4, 2, 3]);
  });

  it("never completes the order of a removed bot", () => {
    controller.addOrder("NORMAL");
    controller.addBot();
    controller.removeBot();
    vi.advanceTimersByTime(TEN_SECONDS * 3);
    expect(completeIds(controller)).toEqual([]);
    expect(pendingIds(controller)).toEqual([1]);
  });

  it("does nothing when removing a bot and there are none", () => {
    expect(controller.removeBot()).toBeUndefined();
  });

  it("numbers bots uniquely even after one is removed", () => {
    controller.addBot();
    controller.addBot();
    controller.removeBot();
    expect(controller.addBot()).toBe(3);
  });
});
