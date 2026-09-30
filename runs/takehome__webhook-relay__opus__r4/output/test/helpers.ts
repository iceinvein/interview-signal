import type { Clock } from "../src/clock.ts";
import type { AttemptResult, OutboundRequest, Sender } from "../src/delivery.ts";
import type { Logger, LogFields } from "../src/logger.ts";

/** Let pending promise continuations (and real I/O callbacks) run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

/** Manually advanced clock. Timers fire in due order, each at its exact due time. */
export class FakeClock implements Clock {
  #now = 0;
  #timers: { due: number; seq: number; fn: () => void }[] = [];
  #seq = 0;

  now(): number {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number): void {
    this.#timers.push({ due: this.#now + ms, seq: this.#seq++, fn });
  }

  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    await flush();
    for (;;) {
      this.#timers.sort((a, b) => a.due - b.due || a.seq - b.seq);
      const next = this.#timers[0];
      if (!next || next.due > target) break;
      this.#timers.shift();
      this.#now = next.due;
      next.fn();
      await flush();
    }
    this.#now = target;
  }
}

export interface RecordedCall extends OutboundRequest {
  at: number;
}

/**
 * Sender whose response to each call is decided by `respond`. Returning
 * `"hang"` leaves the attempt in flight until `release()` is called.
 */
export function scriptedSender(clock: Clock, respond: (req: OutboundRequest, n: number) => AttemptResult | "hang") {
  const calls: RecordedCall[] = [];
  const hanging: ((r: AttemptResult) => void)[] = [];
  const send: Sender = (req) => {
    calls.push({ ...req, at: clock.now() });
    const r = respond(req, calls.length);
    if (r === "hang") return new Promise((resolve) => hanging.push(resolve));
    return Promise.resolve(r);
  };
  const release = (result: AttemptResult = { ok: true, status: 200 }) => hanging.shift()?.(result);
  return { send, calls, release };
}

export function captureLogger(): Logger & { lines: { level: string; msg: string; fields: LogFields }[] } {
  const lines: { level: string; msg: string; fields: LogFields }[] = [];
  const at = (level: string) => (msg: string, fields: LogFields = {}) => void lines.push({ level, msg, fields });
  return { lines, info: at("info"), warn: at("warn"), error: at("error") };
}

export const ok: AttemptResult = { ok: true, status: 200 };
export const fail500: AttemptResult = { ok: false, status: 500 };
