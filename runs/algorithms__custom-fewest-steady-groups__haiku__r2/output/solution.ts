export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;

  let groups = 0;
  let i = 0;

  while (i < scores.length) {
    let min = scores[i];
    let max = scores[i];
    let j = i + 1;

    // Extend the current group as far as possible while keeping it steady
    while (j < scores.length) {
      const newMin = Math.min(min, scores[j]);
      const newMax = Math.max(max, scores[j]);

      if (newMax - newMin <= maxSpread) {
        min = newMin;
        max = newMax;
        j++;
      } else {
        break;
      }
    }

    groups++;
    i = j;
  }

  return groups;
}
