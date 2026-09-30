export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  const n = heights.length;
  if (n === 0) return 0;

  const suffixMax = new Float64Array(n);
  let right = rightWall;
  for (let i = n - 1; i >= 0; i--) {
    if (heights[i] > right) right = heights[i];
    suffixMax[i] = right;
  }

  let total = 0;
  let left = leftWall;
  for (let i = 0; i < n; i++) {
    if (heights[i] > left) left = heights[i];
    const level = left < suffixMax[i] ? left : suffixMax[i];
    total += level - heights[i];
  }
  return total;
}
