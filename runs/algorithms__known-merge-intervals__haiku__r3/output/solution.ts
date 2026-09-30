export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) {
    return [];
  }

  // Sort by start position, then by end position
  const sorted = intervals.sort((a, b) => {
    if (a[0] !== b[0]) {
      return a[0] - b[0];
    }
    return a[1] - b[1];
  });

  const result: [number, number][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const lastInterval = result[result.length - 1];
    const currentInterval = sorted[i];

    // Merge if current interval overlaps (including touching endpoints)
    if (currentInterval[0] <= lastInterval[1]) {
      lastInterval[1] = Math.max(lastInterval[1], currentInterval[1]);
    } else {
      result.push(currentInterval);
    }
  }

  return result;
}
