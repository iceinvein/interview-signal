# Order Controller (McDonald's cooking bots)

Node.js (no dependencies) CLI prototype. All state is in memory.

## Layout
- `src/orderController.js` – core logic (orders, queue priority, bots). Timers only, no I/O; emits events via `onEvent`.
- `src/cli.js` – interactive CLI and a scripted `--demo` mode; prefixes output with `HH:MM:SS`.
- `test/` – unit tests (`node:test`, mocked timers so the 10s processing runs instantly).
- `scripts/test.sh`, `build.sh`, `run.sh` – used by the `backend-verify-result` workflow. `run.sh` writes `scripts/result.txt`.

## Usage
```
npm start            # interactive
npm run demo         # scripted scenario (~35s), same as scripts/run.sh
```
Commands: `normal`, `vip`, `+bot`, `-bot`, `status`, `help`, `quit`.

## Design notes
- Pending queue is kept ordered by (VIP first, then order number). This gives "VIP behind existing VIPs, ahead of normals", and means an order returned by a removed bot lands back in its original position with no extra bookkeeping.
- `-bot` removes the newest bot, cancels its timer and re-queues its order.
- `+bot` and new orders trigger immediate dispatch to idle bots; a bot with nothing to do goes IDLE.
- Processing time is configurable (`processingMs`, default 10000).
