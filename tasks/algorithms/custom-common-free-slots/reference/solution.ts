export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  const clipped: [number, number][] = [];
  for (const person of busy) {
    for (const [s, e] of person) {
      const start = Math.max(s, dayStart);
      const end = Math.min(e, dayEnd);
      if (start < end) clipped.push([start, end]);
    }
  }
  clipped.sort((a, b) => a[0] - b[0]);

  const free: [number, number][] = [];
  const keep = (start: number, end: number) => {
    if (end - start >= minLength) free.push([start, end]);
  };
  // Everything before `freeFrom` is covered by some busy interval already seen.
  let freeFrom = dayStart;
  for (const [start, end] of clipped) {
    if (start > freeFrom) keep(freeFrom, start);
    if (end > freeFrom) freeFrom = end;
  }
  if (freeFrom < dayEnd) keep(freeFrom, dayEnd);
  return free;
}
