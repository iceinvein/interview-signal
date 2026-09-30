export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const h = Float64Array.from(heights).sort();
  const n = h.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += h[i];
  // The cost is convex piecewise linear in L, so an optimum lies at some height value.
  let best = Infinity;
  let prefix = 0;
  for (let i = 0; i < n; i++) {
    const L = h[i];
    if (i > 0 && h[i - 1] === L) {
      prefix += L;
      continue;
    }
    // i columns strictly below L (all earlier ones, since L is the first occurrence)
    const raise = L * i - prefix;
    const lower = total - prefix - L * (n - i);
    const cost = raise * raiseCost + lower * lowerCost;
    if (cost < best) best = cost;
    prefix += L;
  }
  return best;
}
