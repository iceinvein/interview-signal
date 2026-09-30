import type { Clock } from "../src/clock.ts";

/** Lets tests move time forward explicitly; timers fire in due order. */
export class FakeClock implements Clock {
  #now: number;
  #timers: { at: number; seq: number; fn: () => void }[] = [];
  #seq = 0;

  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number): void {
    this.#timers.push({ at: this.#now + ms, seq: this.#seq++, fn });
  }

  /** Advances time by `ms`, firing due timers and letting async work they start settle. */
  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    await settle();
    for (;;) {
      this.#timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.#timers[0];
      if (!next || next.at > target) break;
      this.#timers.shift();
      this.#now = next.at;
      next.fn();
      await settle();
    }
    this.#now = target;
  }
}

/** Flushes pending promise callbacks. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}
