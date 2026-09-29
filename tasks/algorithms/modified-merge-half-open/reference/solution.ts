export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  const sorted = intervals
    .filter(([start, end]) => start < end)
    .map(([start, end]) => [start, end] as [number, number]);
  sorted.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    // Strict: a start equal to the previous end shares no point with it.
    if (last !== undefined && start < last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
