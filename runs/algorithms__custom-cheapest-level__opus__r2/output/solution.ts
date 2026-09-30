export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const n = heights.length;
  const h = Float64Array.from(heights).sort();
  let total = 0;
  for (let i = 0; i < n; i++) total += h[i];

  // Cost is convex piecewise-linear in L with breakpoints at the heights,
  // so the minimum is attained at one of them. Evaluate each distinct height.
  let best = Infinity;
  let prefix = 0; // sum of h[0..i-1]
  for (let i = 0; i < n; i++) {
    if (i > 0 && h[i] === h[i - 1]) {
      prefix += h[i];
      continue;
    }
    const L = h[i];
    const below = i;
    const suffix = total - prefix;
    const above = n - i;
    const cost = raiseCost * (L * below - prefix) + lowerCost * (suffix - L * above);
    if (cost < best) best = cost;
    prefix += h[i];
  }
  return best;
}
