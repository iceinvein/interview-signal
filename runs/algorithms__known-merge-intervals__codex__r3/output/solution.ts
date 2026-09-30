export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];

  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  let [start, end] = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const [nextStart, nextEnd] = sorted[i];
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      merged.push([start, end]);
      start = nextStart;
      end = nextEnd;
    }
  }

  merged.push([start, end]);
  return merged;
}
