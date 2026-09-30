export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  if (heights.length === 0) return 0;

  const n = heights.length;

  // leftMax[i] = max(leftWall, heights[0], ..., heights[i])
  const leftMax = new Array(n);
  leftMax[0] = Math.max(leftWall, heights[0]);
  for (let i = 1; i < n; i++) {
    leftMax[i] = Math.max(leftMax[i - 1], heights[i]);
  }

  // rightMax[i] = max(rightWall, heights[i], ..., heights[n - 1])
  const rightMax = new Array(n);
  rightMax[n - 1] = Math.max(rightWall, heights[n - 1]);
  for (let i = n - 2; i >= 0; i--) {
    rightMax[i] = Math.max(rightMax[i + 1], heights[i]);
  }

  // Calculate total water trapped
  let totalWater = 0;
  for (let i = 0; i < n; i++) {
    const waterLevel = Math.min(leftMax[i], rightMax[i]);
    totalWater += waterLevel - heights[i];
  }

  return totalWater;
}
