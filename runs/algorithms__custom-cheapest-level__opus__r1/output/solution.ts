export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number {
  // Total cost is convex and piecewise linear in L with breakpoints at the
  // heights, so the minimum is attained at one of the heights.
  const n = heights.length;
  const s = Float64Array.from(heights).sort();
  let total = 0;
  for (let i = 0; i < n; i++) total += s[i];

  let best = Infinity;
  let below = 0; // sum of s[0..i-1]
  for (let i = 0; i < n; i++) {
    const L = s[i];
    const above = total - below - L; // sum of s[i+1..n-1]
    const cost = raiseCost * (i * L - below) + lowerCost * (above - (n - i - 1) * L);
    if (cost < best) best = cost;
    below += L;
  }
  return best;
}
