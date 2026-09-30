export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;

  let groups = 1;
  let minimum = scores[0];
  let maximum = scores[0];

  for (let i = 1; i < scores.length; i++) {
    const score = scores[i];
    const nextMinimum = Math.min(minimum, score);
    const nextMaximum = Math.max(maximum, score);

    if (nextMaximum - nextMinimum > maxSpread) {
      groups++;
      minimum = score;
      maximum = score;
    } else {
      minimum = nextMinimum;
      maximum = nextMaximum;
    }
  }

  return groups;
}
