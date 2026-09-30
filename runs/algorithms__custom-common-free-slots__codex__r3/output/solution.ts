export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  if (dayEnd - dayStart < minLength) return [];

  const intervals: [number, number][] = [];
  for (const person of busy) {
    for (const [start, end] of person) {
      const clippedStart = Math.max(start, dayStart);
      const clippedEnd = Math.min(end, dayEnd);
      if (clippedStart < clippedEnd) {
        intervals.push([clippedStart, clippedEnd]);
      }
    }
  }

  intervals.sort((a, b) => a[0] - b[0]);

  const free: [number, number][] = [];
  let cursor = dayStart;
  for (const [start, end] of intervals) {
    if (start - cursor >= minLength) {
      free.push([cursor, start]);
    }
    cursor = Math.max(cursor, end);
    if (cursor === dayEnd) return free;
  }

  if (dayEnd - cursor >= minLength) {
    free.push([cursor, dayEnd]);
  }
  return free;
}
