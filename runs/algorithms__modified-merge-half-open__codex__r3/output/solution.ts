export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  const nonEmpty = intervals
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [start, end] of nonEmpty) {
    const last = merged[merged.length - 1];
    if (last !== undefined && start < last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}
