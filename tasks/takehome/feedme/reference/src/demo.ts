// Scripted walk through every requirement in real time, for scripts/run.sh
// and the GitHub Action. The steps are spaced by wall-clock offsets so the
// log shows genuine 10 second processing.
import { setTimeout as sleep } from "node:timers/promises";
import { logLine, timestamp } from "./format.js";
import { OrderController } from "./orderController.js";

const controller = new OrderController({ processingMs: 10_000, onEvent: (event) => console.log(logLine(event)) });
const started = Date.now();
const at = (seconds: number) => sleep(Math.max(0, started + seconds * 1000 - Date.now()));

console.log("McDonald's Order Management System - Simulation Results\n");
console.log(`[${timestamp(new Date())}] System initialised with 0 bots`);
controller.addOrder("NORMAL");
controller.addOrder("NORMAL");
controller.addOrder("VIP"); // jumps ahead of both normal orders
await at(1);
controller.addBot(); // takes the VIP order at once
controller.addBot(); // takes the oldest normal order
await at(2);
controller.removeBot(); // newest bot drops its order back into PENDING
await at(3);
controller.addOrder("VIP"); // queues ahead of the returned normal order
await at(12);
controller.addBot();
await at(23);
controller.addOrder("NORMAL"); // arrives while a bot is idle
await at(34);

const { pending, complete, bots } = controller.snapshot();
const vip = complete.filter((order) => order.type === "VIP").length;
console.log("\nFinal Status:");
console.log(`- Total Orders Processed: ${complete.length} (${vip} VIP, ${complete.length - vip} Normal)`);
console.log(`- Orders Completed: ${complete.length}`);
console.log(`- Active Bots: ${bots.length}`);
console.log(`- Pending Orders: ${pending.length}`);
