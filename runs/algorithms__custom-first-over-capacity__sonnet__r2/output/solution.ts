export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  const M = 524288; // 2^19 > 2 * 200000
  const keys = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    keys[2 * i] = bookings[i][0] * M + 2 * i;
    keys[2 * i + 1] = bookings[i][1] * M + 2 * i + 1;
  }
  keys.sort();

  let load = 0;
  let i = 0;
  while (i < keys.length) {
    const t = Math.floor(keys[i] / M);
    // apply every event at time t before checking
    while (i < keys.length && Math.floor(keys[i] / M) === t) {
      const id = keys[i] - t * M;
      const b = bookings[id >> 1];
      load += (id & 1) === 0 ? b[2] : -b[2];
      i++;
    }
    if (load > capacity) return t;
  }
  return -1;
}
