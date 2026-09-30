export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  // Collect all busy intervals, clipped to day boundaries
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
    if (length >= minLength) {
      return [[dayStart, dayEnd]];
    }
    return [];
  }

  // Sort by start time
  allBusy.sort((a, b) => a[0] - b[0]);

  // Merge overlapping intervals
  const merged: [number, number][] = [];
  let current = allBusy[0];

  for (let i = 1; i < allBusy.length; i++) {
    const next = allBusy[i];

    if (current[1] >= next[0]) {
      // Overlapping or touching: merge them
      current = [current[0], Math.max(current[1], next[1])];
    } else {
      // No overlap: save current and move to next
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  // Find free intervals in the gaps
  const freeSlots: [number, number][] = [];

  // Gap before first busy interval
  if (merged[0][0] > dayStart) {
    const length = merged[0][0] - dayStart;
    if (length >= minLength) {
      freeSlots.push([dayStart, merged[0][0]]);
    }
  }

  // Gaps between consecutive busy intervals
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i][1];
    const gapEnd = merged[i + 1][0];
    const length = gapEnd - gapStart;

    if (length >= minLength) {
      freeSlots.push([gapStart, gapEnd]);
    }
  }

  // Gap after last busy interval
  if (merged[merged.length - 1][1] < dayEnd) {
    const length = dayEnd - merged[merged.length - 1][1];
    if (length >= minLength) {
      freeSlots.push([merged[merged.length - 1][1], dayEnd]);
    }
  }

  return freeSlots;
}
