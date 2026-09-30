// A small deterministic clock for fast tests and the CI demonstration.
export class FakeClock {
  constructor(start = Date.parse('2026-01-01T12:00:00Z')) {
    this.time = start;
    this.nextId = 1;
    this.timers = new Map();
  }

  now() { return this.time; }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  }

  clearTimeout(id) { this.timers.delete(id); }

  advance(milliseconds) {
    if (milliseconds < 0) throw new Error('Cannot move time backwards');
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
}
