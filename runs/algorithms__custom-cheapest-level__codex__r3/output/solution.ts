export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const sorted = [...heights].sort((a, b) => a - b);
  const targetIndex = Math.ceil(
    (lowerCost * sorted.length) / (raiseCost + lowerCost),
  ) - 1;
  const level = sorted[targetIndex];

  let total = 0;
  for (const height of heights) {
    total += height < level
      ? (level - height) * raiseCost
      : (height - level) * lowerCost;
  }

  return total;
}
