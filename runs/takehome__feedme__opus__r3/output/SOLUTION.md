# Order Controller – Backend Solution (Node.js CLI)

Plain Node.js (>= 22), **no dependencies**. Everything is kept in memory.

## Usage

| Command | What it does |
| --- | --- |
| `npm start` | **Interactive CLI** (`n` normal order, `v` VIP order, `+` add bot, `-` remove bot, `s` status, `h` help, `q` quit) |
| `npm test` / `./scripts/test.sh` | Unit tests (`node:test`, fake timers, so they run in milliseconds) |
| `./scripts/build.sh` | Syntax-checks all sources (nothing needs compiling) |
| `./scripts/run.sh` | Runs a scripted scenario **in real time** (~35s) and writes `scripts/result.txt` with `[HH:MM:SS]` timestamps |

## Layout

```
src/orderController.js  core domain logic (orders, bots, queue, timers)
src/logger.js           HH:MM:SS timestamps + status formatting
src/cli.js              interactive readline CLI
src/simulate.js         scripted scenario used by CI (run.sh)
test/                   unit tests
```

## Design notes

- **One ordering rule for PENDING.** The queue is sorted by *VIP first, then order id*. Because ids
  only go up, that one insert rule does two jobs: a new VIP goes behind the existing VIPs and in front
  of every Normal order, and an order dropped by a removed bot goes back to **its original position**.
- **Dispatch** runs whenever something could let work start: a new order, a new bot, or a bot finishing.
  Each idle bot takes the order at the front of PENDING.
- **Bots** are kept in creation order, so `- Bot` pops the newest one. If it was processing, its
  timer is cancelled and the order goes back to PENDING. The next bot starts that order again from
  the beginning (a full 10s).
- Order numbers start at `1001`. Bot ids are unique and increasing, and ids of removed bots are not reused.
- The controller takes a `log` function and a `processingTimeMs` option. This keeps it separate from
  I/O and makes it easy to test.
