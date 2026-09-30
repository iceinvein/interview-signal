export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const n = heights.length;
  const h = Int32Array.from(heights).sort();
  let total = 0;
  for (let i = 0; i < n; i++) total += h[i];

  // Cost is convex piecewise-linear in L with breakpoints at the heights,
  // so the optimum is attained at one of them.
  let best = Infinity;
  let prefix = 0; // sum of h[0..i-1]
  for (let i = 0; i < n; i++) {
    const L = h[i];
    if (i === 0 || L !== h[i - 1]) {
      const below = i * L - prefix;
      const above = total - prefix - (n - i) * L;
      const cost = raiseCost * below + lowerCost * above;
      if (cost < best) best = cost;
    }
    prefix += L;
  }
  return best;
}
