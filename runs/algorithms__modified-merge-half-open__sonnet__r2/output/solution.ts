export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  const items = intervals.filter(([s, e]) => s < e);
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: [number, number][] = [];
  for (const [s, e] of items) {
    const last = result[result.length - 1];
    if (last && s < last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      result.push([s, e]);
    }
  }
  return result;
}
