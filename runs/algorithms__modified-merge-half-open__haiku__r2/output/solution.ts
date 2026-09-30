export function mergeHalfOpen(intervals: [number, number][]): [number, number][] {
  const nonEmpty = intervals
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

  if (nonEmpty.length === 0) {
    return [];
  }

  const result: [number, number][] = [];
  let [currentStart, currentEnd] = nonEmpty[0];

  for (let i = 1; i < nonEmpty.length; i++) {
    const [nextStart, nextEnd] = nonEmpty[i];

    if (nextStart < currentEnd) {
      currentEnd = Math.max(currentEnd, nextEnd);
    } else {
      result.push([currentStart, currentEnd]);
      currentStart = nextStart;
      currentEnd = nextEnd;
    }
  }

  result.push([currentStart, currentEnd]);
  return result;
}
