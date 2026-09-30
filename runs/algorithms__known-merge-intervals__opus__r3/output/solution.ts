export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = intervals.map(([s, e]) => [s, e] as [number, number]);
  sorted.sort((a, b) => a[0] - b[0]);

  const result: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = result[result.length - 1];
    if (last !== undefined && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      result.push([start, end]);
    }
  }
  return result;
}
