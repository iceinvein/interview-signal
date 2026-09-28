# Order controller: backend CLI in Node.js

## Running it

- `scripts/test.sh` installs dependencies and runs the unit tests (vitest).
- `scripts/build.sh` compiles TypeScript to `dist/`.
- `scripts/run.sh` runs a scripted scenario in real time (about 35 seconds)
  and writes the log to `scripts/result.txt`.
- `npm start` opens the interactive CLI: `n` new normal order, `v` new VIP
  order, `+` add bot, `-` remove bot, `s` status, `q` quit.

## Design

`src/orderController.ts` holds all state in memory: one PENDING queue, one
COMPLETE list and the bots in creation order. Every change reports an event,
and `src/format.ts` turns events into timestamped log lines, so the
controller never touches stdout and the tests can drive it with fake timers.

The PENDING queue is ordered by one rule: VIP before normal, then lower
order number first. A new order always has the highest number, so it lands
at the back of its type; an order dropped by a removed bot lands back where
it was. Removing a bot always takes the newest one and cancels its timer.

## Assumptions

- Order and bot numbers start at 1 and are never reused within a run.
- Removing a bot when there are none does nothing.
- A bot that finishes an order and finds PENDING empty reports IDLE.
