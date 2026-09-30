// Used only for a fast, deterministic CLI demonstration and unit tests.
export class ManualClock {
  constructor(start = Date.UTC(2026, 0, 1, 12, 0, 0)) {
    this.time = start;
    this.nextTimerId = 1;
    this.timers = new Map();
  }

  now = () => this.time;

  setTimer = (callback, delay) => {
    const id = this.nextTimerId++;
    this.timers.set(id, { due: this.time + delay, callback });
    return id;
  };

  clearTimer = (id) => { this.timers.delete(id); };

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error('Time advance must be a nonnegative number');
    }
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort(([aId, a], [bId, b]) => a.due - b.due || aId - bId)[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.time = timer.due;
      timer.callback();
    }
    this.time = target;
  }
}
