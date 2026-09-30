export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const n = heights.length;
  const a = Float64Array.from(heights).sort();
  let total = 0;
  for (let i = 0; i < n; i++) total += a[i];
  // Cost is convex piecewise linear in L, so an optimum lies at one of the heights.
  let best = Infinity;
  let prefix = 0; // sum of a[0..i-1]
  for (let i = 0; i < n; i++) {
    const h = a[i];
    const cost =
      raiseCost * (h * i - prefix) + lowerCost * (total - prefix - h * (n - i));
    if (cost < best) best = cost;
    prefix += h;
  }
  return best;
}
