export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  // Encode each event as ((time * 2 + kind) * 1024 + people), where kind 0 = end, 1 = start.
  // Sorting numerically orders by time, with ends before starts at the same instant.
  const keys = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [start, end, people] = bookings[i];
    keys[2 * i] = (start * 2 + 1) * 1024 + people;
    keys[2 * i + 1] = (end * 2) * 1024 + people;
  }
  keys.sort();

  let load = 0;
  let i = 0;
  while (i < keys.length) {
    const time = Math.floor(keys[i] / 2048);
    while (i < keys.length && Math.floor(keys[i] / 2048) === time) {
      const key = keys[i];
      const people = key % 1024;
      if (Math.floor(key / 1024) % 2 === 1) load += people;
      else load -= people;
      i++;
    }
    if (load > capacity) return time;
  }
  return -1;
}
