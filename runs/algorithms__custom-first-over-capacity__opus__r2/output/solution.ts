export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  // Encode (time, people) as time * 1024 + people; max ~1.02e12, exact in float64.
  const starts = new Float64Array(n);
  const ends = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [s, e, p] = bookings[i];
    starts[i] = s * 1024 + p;
    ends[i] = e * 1024 + p;
  }
  starts.sort();
  ends.sort();

  let i = 0;
  let j = 0;
  let current = 0;
  while (i < n) {
    const t = Math.floor(starts[i] / 1024);
    // Bookings ending at or before t have left (half-open intervals).
    while (j < n && Math.floor(ends[j] / 1024) <= t) {
      current -= ends[j] % 1024;
      j++;
    }
    while (i < n && Math.floor(starts[i] / 1024) === t) {
      current += starts[i] % 1024;
      i++;
    }
    if (current > capacity) return t;
  }
  return -1;
}
