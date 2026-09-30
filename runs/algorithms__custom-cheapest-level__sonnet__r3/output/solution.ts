export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  const a = Float64Array.from(heights).sort();
  const n = a.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += a[i];

  // Cost is convex piecewise linear in L, so an optimum lies at one of the heights.
  let best = Infinity;
  let prefix = 0; // sum of heights strictly below the current level
  let i = 0;
  while (i < n) {
    const L = a[i];
    let j = i;
    while (j < n && a[j] === L) j++;
    const sumAbove = total - prefix - L * (j - i);
    const cost = raiseCost * (L * i - prefix) + lowerCost * (sumAbove - L * (n - j));
    if (cost < best) best = cost;
    prefix += L * (j - i);
    i = j;
  }
  return best;
}
