export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const byStart = [...bookings].sort((a, b) => a[0] - b[0]);
  const byEnd = [...bookings].sort((a, b) => a[1] - b[1]);
  let present = 0;
  let nextEnd = 0;
  // Occupancy only rises at a start, so the first overflow is always at one.
  for (const [start, , people] of byStart) {
    // Half-open intervals: anyone whose booking ends at or before this start has left.
    while (byEnd[nextEnd][1] <= start) {
      present -= byEnd[nextEnd][2];
      nextEnd++;
    }
    present += people;
    if (present > capacity) return start;
  }
  return -1;
}
