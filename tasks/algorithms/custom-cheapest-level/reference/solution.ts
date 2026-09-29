export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  // Total cost is convex and piecewise linear in L with corners only at the
  // heights, so some height is always an optimal level.
  const sorted = Float64Array.from(heights).sort();
  const n = sorted.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += sorted[i];
  let below = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < n; k++) {
    const level = sorted[k];
    const above = total - below - level;
    const cost = raiseCost * (level * k - below) + lowerCost * (above - level * (n - k - 1));
    if (cost < best) best = cost;
    below += level;
  }
  return best;
}
