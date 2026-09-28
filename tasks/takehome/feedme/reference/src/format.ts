import type { ControllerEvent, Order } from "./orderController.js";

const pad = (value: number) => String(value).padStart(2, "0");

export function timestamp(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function label(order: Order): string {
  return `${order.type === "VIP" ? "VIP" : "Normal"} Order #${order.id}`;
}

export function describeEvent(event: ControllerEvent): string {
  switch (event.kind) {
    case "orderCreated":
      return `Created ${label(event.order)} - Status: PENDING`;
    case "botAdded":
      return `Bot #${event.botId} created - Status: ACTIVE`;
    case "orderPicked":
      return `Bot #${event.botId} picked up ${label(event.order)} - Status: PROCESSING`;
    case "orderCompleted":
      return `Bot #${event.botId} completed ${label(event.order)} - Status: COMPLETE (Processing time: ${event.processingMs / 1000}s)`;
    case "botIdle":
      return `Bot #${event.botId} is now IDLE - No pending orders`;
    case "botRemoved":
      return event.returnedOrder
        ? `Bot #${event.botId} destroyed while PROCESSING - ${label(event.returnedOrder)} returned to PENDING`
        : `Bot #${event.botId} destroyed while IDLE`;
  }
}

export function logLine(event: ControllerEvent, now = new Date()): string {
  return `[${timestamp(now)}] ${describeEvent(event)}`;
}
