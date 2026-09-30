export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  const n = heights.length;
  if (n === 0) return 0;

  // suffixMax[i] = max(rightWall, heights[i], ..., heights[n - 1])
  const suffixMax = new Array<number>(n);
  let running = rightWall;
  for (let i = n - 1; i >= 0; i--) {
    if (heights[i] > running) running = heights[i];
    suffixMax[i] = running;
  }

  let total = 0;
  let prefixMax = leftWall;
  for (let i = 0; i < n; i++) {
    if (heights[i] > prefixMax) prefixMax = heights[i];
    const level = prefixMax < suffixMax[i] ? prefixMax : suffixMax[i];
    total += level - heights[i];
  }
  return total;
}
