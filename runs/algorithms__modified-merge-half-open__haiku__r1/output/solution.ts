export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  // Filter out empty intervals (start === end covers no points)
  const validIntervals = intervals.filter(([start, end]) => start < end);

  // If no valid intervals, return empty
  if (validIntervals.length === 0) {
    return [];
  }

  // Sort by start value (then by end for stability)
  validIntervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const result: [number, number][] = [];
  let [currentStart, currentEnd] = validIntervals[0];

  for (let i = 1; i < validIntervals.length; i++) {
    const [start, end] = validIntervals[i];

    // Intervals share a point if start < currentEnd
    // (start is in [currentStart, currentEnd))
    if (start < currentEnd) {
      // Merge by extending the end
      currentEnd = Math.max(currentEnd, end);
    } else {
      // No overlap, add current to result and start a new one
      result.push([currentStart, currentEnd]);
      currentStart = start;
      currentEnd = end;
    }
  }

  // Add the last interval
  result.push([currentStart, currentEnd]);

  return result;
}
