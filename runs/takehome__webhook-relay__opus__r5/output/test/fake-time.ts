/** Manually advanced clock + scheduler, so time-dependent behaviour is tested without real waits. */
export class FakeTime {
  now = 0;
  #timers: { at: number; fn: () => void }[] = [];

  readonly clock = (): number => this.now;
  readonly schedule = (fn: () => void, delayMs: number): void => {
    this.#timers.push({ at: this.now + delayMs, fn });
  };

  get pendingTimers(): number {
    return this.#timers.length;
  }

  /** Moves time forward, firing due timers in order and letting their async work settle. */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      await settle();
      this.#timers.sort((a, b) => a.at - b.at);
      const next = this.#timers[0];
      if (!next || next.at > target) break;
      this.#timers.shift();
      this.now = next.at;
      next.fn();
    }
    this.now = target;
    await settle();
  }
}

/** Lets queued promise callbacks run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
