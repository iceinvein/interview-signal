# FeedMe order controller

An in-memory Node.js CLI for normal and VIP restaurant orders. Requires Node.js 22 or newer; there are no third-party packages.

## Run it

```bash
./scripts/test.sh   # unit tests (uses a controllable clock, so it finishes quickly)
./scripts/build.sh  # validates the JavaScript source; Node.js needs no compilation
./scripts/run.sh    # runs a real-time, 10-second demonstration into scripts/result.txt
node src/cli.js     # interactive CLI
```

In the interactive CLI, enter `normal` or `vip` to create an order, `+` to add a bot, `-` to remove the newest bot, `status` to inspect the three order areas and bot states, `help` for commands, and `quit` to exit. The long forms `new normal order`, `new vip order`, `+ bot`, and `- bot` also work. Commands and event output use the terminal; timers keep running while the CLI waits for input.

Every output line begins with a UTC `HH:MM:SS` timestamp. Run `./scripts/run.sh` from any directory to regenerate the committed `scripts/result.txt`. The demo adds a normal order, then a VIP order, starts two bots, cancels the newest bot, returns its order to PENDING, adds a replacement bot, and waits for both orders to complete.

## Behavior

- Pending VIP orders lead normal orders. Within each type, increasing order numbers preserve submission order, including when a canceled order returns to the queue.
- An idle bot takes the first pending order immediately. Each pickup needs ten uninterrupted seconds; removing its bot cancels the timer and returns the order to PENDING. A later pickup starts a fresh ten seconds.
- Bot and order numbers increase during the lifetime of the process. Completed orders stay in the COMPLETE area until the process exits. Data is not persisted.
- `status` shows PENDING, PROCESSING, COMPLETE, and each bot's IDLE or BUSY state. An in-progress order leaves PENDING when picked up.

The repository workflow runs `scripts/test.sh`, `scripts/build.sh`, and `scripts/run.sh`, then checks that `scripts/result.txt` exists and has timestamps.
