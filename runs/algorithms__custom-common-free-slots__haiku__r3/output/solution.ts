export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  // Collect all busy intervals clipped to the day
  const allBusy: [number, number][] = [];

  for (const personBusy of busy) {
    for (const [s, e] of personBusy) {
      const clippedStart = Math.max(s, dayStart);
      const clippedEnd = Math.min(e, dayEnd);

      if (clippedStart < clippedEnd) {
        allBusy.push([clippedStart, clippedEnd]);
      }
    }
  }

  // If no busy intervals, the whole day is free
  if (allBusy.length === 0) {
    const length = dayEnd - dayStart;
    return length >= minLength ? [[dayStart, dayEnd]] : [];
  }

  // Sort by start time, then by end time
  allBusy.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge overlapping/adjacent intervals
  const merged: [number, number][] = [];
  for (const [s, e] of allBusy) {
    if (merged.length === 0) {
      merged.push([s, e]);
    } else {
      const [, lastEnd] = merged[merged.length - 1];
      if (s <= lastEnd) {
        // Overlapping or adjacent, merge
        merged[merged.length - 1][1] = Math.max(lastEnd, e);
      } else {
        // Non-overlapping, add new interval
        merged.push([s, e]);
      }
    }
  }

  // Find free slots
  const freeSlots: [number, number][] = [];

  // Check before the first busy interval
  if (merged[0][0] > dayStart) {
    const length = merged[0][0] - dayStart;
    if (length >= minLength) {
      freeSlots.push([dayStart, merged[0][0]]);
    }
  }

  // Check between consecutive busy intervals
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i][1];
    const gapEnd = merged[i + 1][0];
    const length = gapEnd - gapStart;
    if (length >= minLength) {
      freeSlots.push([gapStart, gapEnd]);
    }
  }

  // Check after the last busy interval
  const lastEnd = merged[merged.length - 1][1];
  if (lastEnd < dayEnd) {
    const length = dayEnd - lastEnd;
    if (length >= minLength) {
      freeSlots.push([lastEnd, dayEnd]);
    }
  }

  return freeSlots;
}
