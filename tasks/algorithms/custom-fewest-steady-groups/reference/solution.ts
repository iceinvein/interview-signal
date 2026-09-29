export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;
  // Extending each group as far as it stays steady is optimal: any split
  // can be shifted so its first group ends no earlier than the greedy one.
  let groups = 1;
  let low = scores[0];
  let high = scores[0];
  for (let i = 1; i < scores.length; i++) {
    const score = scores[i];
    const nextLow = Math.min(low, score);
    const nextHigh = Math.max(high, score);
    if (nextHigh - nextLow <= maxSpread) {
      low = nextLow;
      high = nextHigh;
    } else {
      groups++;
      low = score;
      high = score;
    }
  }
  return groups;
}
