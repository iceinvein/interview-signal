export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
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
  let nextFreeStart = dayStart;

  for (const [start, end] of intervals) {
    if (start > nextFreeStart && start - nextFreeStart >= minLength) {
      free.push([nextFreeStart, start]);
    }
    nextFreeStart = Math.max(nextFreeStart, end);
  }

  if (dayEnd - nextFreeStart >= minLength) {
    free.push([nextFreeStart, dayEnd]);
  }

  return free;
}
