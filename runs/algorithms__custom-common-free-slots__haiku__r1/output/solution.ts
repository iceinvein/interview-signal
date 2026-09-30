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

  // If no busy intervals, entire day is free
  if (allBusy.length === 0) {
    if (dayEnd - dayStart >= minLength) {
      return [[dayStart, dayEnd]];
    }
    return [];
  }

  // Sort by start time, then by end time
  allBusy.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge overlapping intervals
  const merged: [number, number][] = [];
  let [currentStart, currentEnd] = allBusy[0];

  for (let i = 1; i < allBusy.length; i++) {
    const [s, e] = allBusy[i];

    if (s <= currentEnd) {
      // Overlapping or touching, extend current interval
      currentEnd = Math.max(currentEnd, e);
    } else {
      // No overlap, save current and start new
      merged.push([currentStart, currentEnd]);
      currentStart = s;
      currentEnd = e;
    }
  }
  merged.push([currentStart, currentEnd]);

  // Find free slots
  const freeSlots: [number, number][] = [];

  // Before first busy interval
  if (merged[0][0] - dayStart >= minLength) {
    freeSlots.push([dayStart, merged[0][0]]);
  }

  // Between consecutive busy intervals
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i][1];
    const gapEnd = merged[i + 1][0];

    if (gapEnd - gapStart >= minLength) {
      freeSlots.push([gapStart, gapEnd]);
    }
  }

  // After last busy interval
  const lastEnd = merged[merged.length - 1][1];
  if (dayEnd - lastEnd >= minLength) {
    freeSlots.push([lastEnd, dayEnd]);
  }

  return freeSlots;
}
