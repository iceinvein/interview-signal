import type { Clock } from '../src/clock.ts';
import type { OutboundRequest, SendResult, Sender } from '../src/delivery.ts';

/** Lets pending promise callbacks and I/O callbacks run. */
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A clock that only moves when told to. Timers fire in due-time order during advance(). */
export class FakeClock implements Clock {
  #now = 0;
  #seq = 0;
  #timers: { at: number; seq: number; fn: () => void }[] = [];

  now(): number {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number): void {
    this.#timers.push({ at: this.#now + ms, seq: this.#seq++, fn });
  }

  get pendingTimers(): number {
    return this.#timers.length;
  }

  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    for (;;) {
      await flush();
      const due = this.#timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.#timers.splice(this.#timers.indexOf(due), 1);
      this.#now = due.at;
      due.fn();
    }
    this.#now = target;
    await flush();
  }
}

export interface RecordedCall {
  req: OutboundRequest;
  at: number;
}

/** A Sender that records every attempt (with the fake time it happened) and answers via `respond`. */
export function recordingSender(
  clock: Clock,
  respond: (req: OutboundRequest, callIndex: number) => SendResult | Promise<SendResult> = () => ({ ok: true, status: 200 }),
): { send: Sender; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const send: Sender = async (req) => {
    calls.push({ req, at: clock.now() });
    return respond(req, calls.length - 1);
  };
  return { send, calls };
}

export const never = <T>() => new Promise<T>(() => {});
