export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const sorted = heights.slice().sort((a, b) => a - b);
  const targetIndex = Math.ceil((lowerCost * sorted.length) / (raiseCost + lowerCost)) - 1;
  const level = sorted[targetIndex];

  let totalCost = 0;
  for (const height of sorted) {
    if (height < level) {
      totalCost += (level - height) * raiseCost;
    } else {
      totalCost += (height - level) * lowerCost;
    }
  }

  return totalCost;
}
