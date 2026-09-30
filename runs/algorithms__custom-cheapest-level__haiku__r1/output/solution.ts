export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const uniqueHeights = Array.from(new Set(heights)).sort((a, b) => a - b);
  const sortedHeights = heights.slice().sort((a, b) => a - b);

  const n = sortedHeights.length;
  const prefixSum = new Array(n + 1);
  prefixSum[0] = 0;
  for (let i = 0; i < n; i++) {
    prefixSum[i + 1] = prefixSum[i] + sortedHeights[i];
  }

  let minCost = Infinity;

  for (const level of uniqueHeights) {
    // Binary search: find first index where height >= level
    let left = 0, right = n;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (sortedHeights[mid] < level) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    const idx = left;

    // Cost to raise heights[0..idx-1] to level
    const raiseSum = prefixSum[idx];
    const raiseCostTotal = idx * level - raiseSum;

    // Cost to lower heights[idx..n-1] to level
    const lowerSum = prefixSum[n] - prefixSum[idx];
    const lowerCostTotal = lowerSum - (n - idx) * level;

    const cost = raiseCost * raiseCostTotal + lowerCost * lowerCostTotal;
    minCost = Math.min(minCost, cost);
  }

  return minCost;
}
