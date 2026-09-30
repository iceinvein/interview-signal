# Order Controller – Backend Solution (Node.js CLI)

Plain Node.js (>= 18) with **no runtime or dev dependencies**. Tests use the built-in `node:test` runner.

## Quick start

```bash
./scripts/test.sh    # unit tests
./scripts/build.sh   # npm install + syntax check
./scripts/run.sh     # scripted scenario -> scripts/result.txt (takes about 37s, real 10s cook time)
npm start            # interactive CLI
```

### Interactive commands

| Command          | Action                                             |
|------------------|----------------------------------------------------|
| `n` / `normal`   | New Normal Order                                   |
| `v` / `vip`      | New VIP Order                                      |
| `+` / `+bot`     | Add a bot                                          |
| `-` / `-bot`     | Remove the newest bot                              |
| `s` / `status`   | Show bots, PENDING and COMPLETE areas              |
| `w` / `wait <s>` | Pause for `<s>` seconds (for scripted input)       |
| `h` / `help`     | Help                                               |
| `q` / `quit`     | Print final summary and exit                       |

Every event is printed as `[HH:MM:SS] message`. Pass `--output <file>` to also write the log to a file.
The CLI reads the same commands from a pipe, so `run.sh` just feeds it `scripts/demo-commands.txt`.

## Design

```
src/OrderController.js  domain logic: orders, priority queue, bots, timers
src/logger.js           HH:MM:SS formatting, fan-out to console/file
src/cli.js              readline loop that maps commands to controller calls
```

- **Priority queue.** PENDING is kept sorted by `(VIP first, then order number)`. New VIP orders go behind
  existing VIPs and ahead of every Normal order. Order numbers only go up, so the same comparator puts an
  interrupted order back in its **original position**. No extra bookkeeping is needed.
- **Bots.** Each bot is either `IDLE` or `PROCESSING` exactly one order, and holds a `setTimeout` handle for it.
  When a bot finishes, it takes the next pending order or goes `IDLE`. The controller calls `dispatch()` after
  every change (new order, new bot, bot removed), and that gives pending orders to idle bots.
- **Removing a bot.** Removes the newest bot. If it was processing, its timer is cancelled, so the order never
  completes, and the order is re-queued. When another bot picks it up, the full 10 seconds start again.
- **Testability.** The controller doesn't know about the console or files. It reports events through an
  `onEvent` callback, and its timers are injectable. The tests use `mock.timers` to make time deterministic, so
  the whole suite runs in milliseconds.

## Assumptions

- Order numbers start at 1 and count up. They are shared by VIP and Normal orders.
- Bot numbers are never reused, so a new bot after a removal gets a fresh id.
- An interrupted order starts cooking from zero again. No partial progress is kept.
- `- Bot` when there are no bots does nothing and logs a message.
