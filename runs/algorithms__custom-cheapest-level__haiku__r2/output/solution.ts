export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const cost = (level: number): number => {
    let total = 0;
    for (const h of heights) {
      if (h < level) {
        total += (level - h) * raiseCost;
      } else if (h > level) {
        total += (h - level) * lowerCost;
      }
    }
    return total;
  };

  let left = Math.min(...heights);
  let right = Math.max(...heights);

  // Ternary search for the optimal integer level
  while (right - left > 2) {
    const mid1 = left + Math.floor((right - left) / 3);
    const mid2 = right - Math.floor((right - left) / 3);

    if (cost(mid1) > cost(mid2)) {
      left = mid1;
    } else {
      right = mid2;
    }
  }

  // Check remaining candidates
  let minCost = Infinity;
  for (let level = left; level <= right; level++) {
    minCost = Math.min(minCost, cost(level));
  }

  return minCost;
}
