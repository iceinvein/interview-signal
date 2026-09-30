export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const n = bookings.length;
  // Encode (time, people) as time * 1024 + people; fits exactly in a double (< 2^53).
  const starts = new Float64Array(n);
  const ends = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const [s, e, p] = bookings[k];
    starts[k] = s * 1024 + p;
    ends[k] = e * 1024 + p;
  }
  starts.sort();
  ends.sort();

  let present = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = Math.floor(starts[i] / 1024);
    // Half-open intervals: anyone whose end <= t has already left.
    while (j < n && Math.floor(ends[j] / 1024) <= t) {
      present -= ends[j] - Math.floor(ends[j] / 1024) * 1024;
      j++;
    }
    present += starts[i] - t * 1024;
    if (present > capacity) return t;
  }
  return -1;
}
