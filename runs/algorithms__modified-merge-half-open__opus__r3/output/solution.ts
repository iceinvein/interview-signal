export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  const nonEmpty = intervals.filter(([s, e]) => s < e).map(([s, e]) => [s, e] as [number, number]);
  nonEmpty.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const result: [number, number][] = [];
  for (const [s, e] of nonEmpty) {
    const last = result[result.length - 1];
    // Half-open: overlap only if the next start is strictly before the current end.
    if (last && s < last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      result.push([s, e]);
    }
  }
  return result;
}
