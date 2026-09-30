export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) {
    return [];
  }

  // Sort intervals by start position
  const sorted = intervals.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const [currentStart, currentEnd] = sorted[i];
    const [lastStart, lastEnd] = merged[merged.length - 1];

    // If current interval overlaps with last merged interval, extend it
    if (currentStart <= lastEnd) {
      merged[merged.length - 1] = [lastStart, Math.max(lastEnd, currentEnd)];
    } else {
      // No overlap, add as new interval
      merged.push([currentStart, currentEnd]);
    }
  }

  return merged;
}
