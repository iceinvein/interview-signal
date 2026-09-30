export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;

  let groupCount = 1;
  let currentMin = scores[0];
  let currentMax = scores[0];

  for (let i = 1; i < scores.length; i++) {
    const newMin = Math.min(currentMin, scores[i]);
    const newMax = Math.max(currentMax, scores[i]);

    if (newMax - newMin <= maxSpread) {
      currentMin = newMin;
      currentMax = newMax;
    } else {
      groupCount++;
      currentMin = scores[i];
      currentMax = scores[i];
    }
  }

  return groupCount;
}
