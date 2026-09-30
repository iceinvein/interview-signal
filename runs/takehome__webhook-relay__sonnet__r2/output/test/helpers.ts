import type { Clock } from "../src/types.ts";

/** Manually-advanced clock. advance() fires due timers in order and lets promise chains settle. */
export class FakeClock implements Clock {
  private time = 0;
  private timers: { at: number; fn: () => void }[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): void {
    this.timers.push({ at: this.time + ms, fn });
  }

  get scheduled(): number {
    return this.timers.length;
  }

  async settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  }

  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await this.settle();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.time = next.at;
      next.fn();
      await this.settle();
    }
    this.time = target;
  }
}
