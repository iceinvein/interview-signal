export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];

  // Sort by start point, then by end point
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: [number, number][] = [];
  let currentStart = sorted[0][0];
  let currentEnd = sorted[0][1];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];

    if (start <= currentEnd) {
      // Overlapping or adjacent intervals: merge by extending the end point
      currentEnd = Math.max(currentEnd, end);
    } else {
      // No overlap: save current interval and start tracking the new one
      merged.push([currentStart, currentEnd]);
      currentStart = start;
      currentEnd = end;
    }
  }

  // Push the last interval
  merged.push([currentStart, currentEnd]);

  return merged;
}
