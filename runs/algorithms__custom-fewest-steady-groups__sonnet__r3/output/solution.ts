export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;
  let groups = 1;
  let min = scores[0];
  let max = scores[0];
  for (let i = 1; i < scores.length; i++) {
    const s = scores[i];
    const lo = s < min ? s : min;
    const hi = s > max ? s : max;
    if (hi - lo > maxSpread) {
      groups++;
      min = s;
      max = s;
    } else {
      min = lo;
      max = hi;
    }
  }
  return groups;
}
