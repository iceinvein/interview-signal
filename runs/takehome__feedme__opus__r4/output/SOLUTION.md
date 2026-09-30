# Order Controller – Backend Solution

Plain Node.js (>= 22), zero dependencies. Tests use the built-in `node:test` runner with mocked timers.

## Run it

```bash
npm start                 # interactive CLI
./scripts/test.sh         # unit tests
./scripts/build.sh        # install + syntax check
./scripts/run.sh          # scripted demo -> scripts/result.txt (~30s, real 10s cooking time)
```

### Interactive commands

| Command            | Action                                        |
|--------------------|-----------------------------------------------|
| `n` / `normal`     | New Normal Order                              |
| `v` / `vip`        | New VIP Order                                 |
| `+` / `+bot`       | Add a bot                                     |
| `-` / `-bot`       | Remove the newest bot                         |
| `s` / `status`     | Show bots, PENDING and COMPLETE areas         |
| `wait <sec>`       | Pause before the next command (for scripts)   |
| `h` / `help`       | Help                                          |
| `q` / `quit`       | Print final status and exit                   |

When stdin is not a TTY, the same command loop reads commands line by line. `run.sh` uses this to
replay `scripts/demo.txt`, so the CI output comes from exactly the code path used interactively.

## Design

```
src/orderController.js  domain logic: PENDING queue, COMPLETE list, bots (emits events, no I/O)
src/logger.js           turns controller events into "[HH:MM:SS] ..." lines; status formatting
src/cli.js              readline command loop
```

- **Priority queue.** PENDING is kept sorted by *(VIP first, then order number)*. Order numbers
  are unique and always increasing, so a new VIP order lands behind existing VIPs and ahead of all
  normal orders. The same ordering puts an order back in its **original position** when its bot is
  removed, with no extra bookkeeping.
- **Bots.** Each bot holds at most one order and one `setTimeout` (10s). When it finishes, it takes
  the next PENDING order or goes IDLE. New orders and returned orders are dispatched to idle bots
  straight away.
- **Removing a bot** pops the newest one, cancels its timer and returns its order to PENDING. If
  another bot is idle it picks that order up and starts a fresh 10 seconds of cooking.
- The controller emits events and never prints anything. That keeps it easy to test and lets the
  CLI decide how output looks.

## Assumptions

- Order numbers start at 1001 (as in the sample output); bot numbers are never reused.
- A cancelled order restarts its full 10 seconds when it is picked up again (partial progress is lost).
- Timestamps use the machine's local time (UTC on GitHub Actions).
