import type { Clock } from "../src/clock.ts";
import type { Fields, Logger } from "../src/logger.ts";

/** Manually advanced clock: sleepers wake only when advance() passes their deadline. */
export class FakeClock implements Clock {
  private time = 1_000_000;
  private sleepers: { at: number; wake: () => void }[] = [];

  now(): number {
    return this.time;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((wake) => this.sleepers.push({ at: this.time + ms, wake }));
  }

  get sleeping(): number {
    return this.sleepers.length;
  }

  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    for (;;) {
      await flush();
      const due = this.sleepers.filter((s) => s.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.sleepers.splice(this.sleepers.indexOf(due), 1);
      this.time = due.at;
      due.wake();
    }
    this.time = target;
    await flush();
  }
}

/** Let all queued promise continuations run. */
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export class CapturingLogger implements Logger {
  readonly lines: string[] = [];
  info(msg: string, fields: Fields = {}) {
    this.lines.push(JSON.stringify({ msg, ...fields }));
  }
  error(msg: string, fields: Fields = {}) {
    this.lines.push(JSON.stringify({ level: "error", msg, ...fields }));
  }
}
