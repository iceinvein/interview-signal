export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  const n = heights.length;
  if (n === 0) return 0;
  const suffix = new Array<number>(n);
  let m = rightWall;
  for (let i = n - 1; i >= 0; i--) {
    if (heights[i] > m) m = heights[i];
    suffix[i] = m;
  }
  let total = 0;
  let left = leftWall;
  for (let i = 0; i < n; i++) {
    if (heights[i] > left) left = heights[i];
    total += Math.min(left, suffix[i]) - heights[i];
  }
  return total;
}
