export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const sorted = [...heights].sort((a, b) => a - b);
  const rank = Math.ceil((sorted.length * lowerCost) / (raiseCost + lowerCost)) - 1;
  const level = sorted[rank];

  let total = 0;
  for (const height of heights) {
    if (height < level) {
      total += (level - height) * raiseCost;
    } else {
      total += (height - level) * lowerCost;
    }
  }
  return total;
}
