# Order Controller – Solution Notes

Plain Node.js (>= 20), no third-party dependencies. All state is in memory.

## Usage

```bash
npm start              # interactive CLI
npm run demo           # scripted scenario (what scripts/run.sh writes to scripts/result.txt)
npm test               # unit tests (node:test with mocked timers)

PROCESSING_MS=2000 npm start   # optional: shorter processing time for live demos (default 10000)
```

Interactive commands:

| Command         | Action                                         |
|-----------------|------------------------------------------------|
| `n` / `normal`  | New Normal Order                               |
| `v` / `vip`     | New VIP Order                                  |
| `+` / `add`     | + Bot                                          |
| `-` / `remove`  | - Bot (removes the newest bot)                 |
| `s` / `status`  | Show PENDING / PROCESSING / COMPLETE and bots  |
| `h` / `help`    | Help                                           |
| `q` / `quit`    | Exit                                           |

Every event is printed with an `[HH:MM:SS]` timestamp.

## Structure

```
src/orderController.js   Domain logic: queue, bots, timers. Emits events, does no I/O.
src/logger.js            Turns controller events into timestamped log lines; status formatter.
src/cli.js               Interactive REPL (default) and scripted demo (--demo).
test/                    Unit tests for the controller and the time formatter.
scripts/                 test.sh / build.sh / run.sh used by the GitHub Action.
```

## Design decisions

- **Priority queue rule.** Pending orders are kept sorted by `(VIP first, then order id)`.
  Because order ids are unique and increasing, one rule covers both requirements:
  a new VIP order lands behind existing VIPs and ahead of all Normals, and an order
  returned by a destroyed bot goes back to exactly its original position.
- **Removing a bot** removes the newest one (LIFO). If it was processing, its timer is
  cleared and the order goes back to PENDING. When a bot picks it up again, processing
  starts from 0 (the full 10 s).
- **Bots are timers, not threads.** Each busy bot owns one `setTimeout`. When it fires, the order
  completes and the bot either takes the next pending order or becomes IDLE. New orders
  and new bots trigger a dispatch, so idle bots start work right away.
- **Events decouple logic from output.** The controller emits events (`orderCreated`,
  `orderPickedUp`, `orderCompleted`, `botIdle`, `botCreated`, `botDestroyed`). The logger
  subscribes to them, which keeps the controller easy to test with mocked timers.
- Order numbers start at 1. The processing time is configurable only so demos and tests run faster.
