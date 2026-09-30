export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  // Filter out intervals with start === end (they cover no points)
  const validIntervals = intervals.filter(([start, end]) => start < end);

  // If no valid intervals, return empty array
  if (validIntervals.length === 0) {
    return [];
  }

  // Sort by start position
  validIntervals.sort((a, b) => a[0] - b[0]);

  const result: [number, number][] = [];
  let [currentStart, currentEnd] = validIntervals[0];

  for (let i = 1; i < validIntervals.length; i++) {
    const [nextStart, nextEnd] = validIntervals[i];

    // Check if intervals overlap for half-open intervals.
    // [currentStart, currentEnd) overlaps with [nextStart, nextEnd)
    // iff currentEnd > nextStart (since nextStart >= currentStart due to sorting).
    if (nextStart < currentEnd) {
      // Merge: extend currentEnd if needed
      currentEnd = Math.max(currentEnd, nextEnd);
    } else {
      // No overlap, save current interval and start new one
      result.push([currentStart, currentEnd]);
      currentStart = nextStart;
      currentEnd = nextEnd;
    }
  }

  // Add the last interval
  result.push([currentStart, currentEnd]);

  return result;
}
