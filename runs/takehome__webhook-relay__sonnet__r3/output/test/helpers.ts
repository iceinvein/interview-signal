import type { Clock } from "../src/clock.ts";
import type { TenantConfig } from "../src/config.ts";

/** Manually advanced clock: timers fire only inside advance(). */
export class FakeClock implements Clock {
  private t = 0;
  private timers: { at: number; fn: () => void; seq: number }[] = [];
  private seq = 0;

  now() {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number) {
    const timer = { at: this.t + ms, fn, seq: this.seq++ };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((x) => x !== timer);
    };
  }

  /** Move time forward, firing due timers in order and letting promise chains settle after each. */
  async advance(ms: number) {
    const target = this.t + ms;
    await flush();
    for (;;) {
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
      await flush();
    }
    this.t = target;
  }

  get pendingTimers() {
    return this.timers.length;
  }
}

export const flush = () => new Promise<void>((r) => setImmediate(r));

export const tenant = (over: Partial<TenantConfig> = {}): TenantConfig => ({
  destination: "http://dest.invalid/hook",
  maxAttempts: 4,
  initialBackoffMs: 1000,
  requestsPerSecond: 100,
  ...over,
});
