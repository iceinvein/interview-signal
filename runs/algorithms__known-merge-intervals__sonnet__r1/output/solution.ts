export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = intervals.map((i) => [i[0], i[1]] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = result[result.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      result.push([start, end]);
    }
  }
  return result;
}
