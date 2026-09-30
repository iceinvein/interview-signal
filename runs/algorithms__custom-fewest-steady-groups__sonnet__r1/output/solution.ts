export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;
  let groups = 1;
  let lo = scores[0];
  let hi = scores[0];
  for (let i = 1; i < scores.length; i++) {
    const s = scores[i];
    const nlo = s < lo ? s : lo;
    const nhi = s > hi ? s : hi;
    if (nhi - nlo > maxSpread) {
      groups++;
      lo = s;
      hi = s;
    } else {
      lo = nlo;
      hi = nhi;
    }
  }
  return groups;
}
