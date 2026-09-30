export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  if (scores.length === 0) return 0;

  let groups = 1;
  let smallest = scores[0];
  let largest = scores[0];

  for (let i = 1; i < scores.length; i++) {
    const score = scores[i];
    const nextSmallest = Math.min(smallest, score);
    const nextLargest = Math.max(largest, score);

    if (nextLargest - nextSmallest > maxSpread) {
      groups++;
      smallest = score;
      largest = score;
    } else {
      smallest = nextSmallest;
      largest = nextLargest;
    }
  }

  return groups;
}
