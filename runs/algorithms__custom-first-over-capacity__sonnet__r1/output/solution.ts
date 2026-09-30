export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  const keys = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [s, e, p] = bookings[i];
    keys[2 * i] = s * 4096 + (p + 2048);
    keys[2 * i + 1] = e * 4096 + (2048 - p);
  }
  keys.sort();
  let cur = 0;
  let i = 0;
  const m = keys.length;
  while (i < m) {
    const t = Math.floor(keys[i] / 4096);
    while (i < m && Math.floor(keys[i] / 4096) === t) {
      cur += (keys[i] % 4096) - 2048;
      i++;
    }
    if (cur > capacity) return t;
  }
  return -1;
}
