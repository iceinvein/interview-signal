export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = intervals
    .map(([s, e]) => [s, e] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = result[result.length - 1];
    if (last && s <= last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      result.push([s, e]);
    }
  }
  return result;
}
