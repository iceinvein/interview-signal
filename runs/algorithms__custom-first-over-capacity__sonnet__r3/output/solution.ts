export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  const keys = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [s, e, p] = bookings[i];
    keys[2 * i] = s * 2048 + (p + 1024);
    keys[2 * i + 1] = e * 2048 + (-p + 1024);
  }
  keys.sort();
  let total = 0;
  let i = 0;
  const m = keys.length;
  while (i < m) {
    const t = Math.floor(keys[i] / 2048);
    while (i < m && Math.floor(keys[i] / 2048) === t) {
      total += (keys[i] - t * 2048) - 1024;
      i++;
    }
    if (total > capacity) return t;
  }
  return -1;
}
