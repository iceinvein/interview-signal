export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const sorted = [...heights].sort((a, b) => a - b);
  const n = sorted.length;

  const prefixSum = [0];
  for (let i = 0; i < n; i++) {
    prefixSum.push(prefixSum[i] + sorted[i]);
  }

  let minCost = Infinity;
  let lastHeight = -1;

  for (let i = 0; i < n; i++) {
    const L = sorted[i];

    if (L === lastHeight) {
      continue;
    }
    lastHeight = L;

    const raiseCount = i;
    const raiseSum = prefixSum[i];
    const raiseCostTotal = (raiseCount * L - raiseSum) * raiseCost;

    const lowerCount = n - i - 1;
    const lowerSum = prefixSum[n] - prefixSum[i + 1];
    const lowerCostTotal = (lowerSum - lowerCount * L) * lowerCost;

    const totalCost = raiseCostTotal + lowerCostTotal;
    minCost = Math.min(minCost, totalCost);
  }

  return minCost;
}
