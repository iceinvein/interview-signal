import { OrderController, timestamp } from './order-controller.js';
import { FakeClock } from './fake-clock.js';

const clock = new FakeClock();
const controller = new OrderController({ clock, log: console.log });

controller.newOrder('Normal'); // #1
controller.newOrder('VIP');    // #2, ahead of normal orders
controller.newOrder('Normal'); // #3
controller.addBot();          // Picks up #2
controller.addBot();          // Picks up #1
clock.advance(3_000);
controller.newOrder('VIP');   // #4, ahead of #3
clock.advance(1_000);
controller.removeBot();       // Cancels #1 and restores its original queue position
clock.advance(36_000);        // Remaining bot finishes #2, #4, #1, #3

const state = controller.status();
console.log(`[${timestamp(clock.now())}] Final status: ${JSON.stringify(state)}`);
