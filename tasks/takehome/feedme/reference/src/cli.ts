// Interactive controller: one command per line on stdin.
import { createInterface } from "node:readline";
import { logLine } from "./format.js";
import { OrderController } from "./orderController.js";

const HELP = "Commands: n (new normal order), v (new VIP order), + (add bot), - (remove bot), s (status), q (quit)";
const controller = new OrderController({ processingMs: 10_000, onEvent: (event) => console.log(logLine(event)) });

function printStatus(): void {
  const { pending, complete, bots } = controller.snapshot();
  const ids = (orders: { id: number }[]) => orders.map((order) => `#${order.id}`).join(", ") || "none";
  console.log(`PENDING: ${ids(pending)}`);
  console.log(`COMPLETE: ${ids(complete)}`);
  console.log(`BOTS: ${bots.map((bot) => (bot.status === "IDLE" ? `#${bot.id} IDLE` : `#${bot.id} -> #${bot.orderId}`)).join(", ") || "none"}`);
}

console.log(HELP);
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  switch (line.trim()) {
    case "n":
      controller.addOrder("NORMAL");
      break;
    case "v":
      controller.addOrder("VIP");
      break;
    case "+":
      controller.addBot();
      break;
    case "-":
      if (controller.removeBot() === undefined) console.log("No bot to remove");
      break;
    case "s":
      printStatus();
      break;
    case "q":
      process.exit(0);
    default:
      console.log(HELP);
  }
});
