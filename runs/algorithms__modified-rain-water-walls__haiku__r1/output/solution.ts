export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  const n = heights.length;

  if (n === 0) return 0;

  // maxFromLeft[i] = max(leftWall, heights[0], heights[1], ..., heights[i])
  const maxFromLeft = new Array(n);
  maxFromLeft[0] = Math.max(leftWall, heights[0]);
  for (let i = 1; i < n; i++) {
    maxFromLeft[i] = Math.max(maxFromLeft[i - 1], heights[i]);
  }

  // maxFromRight[i] = max(rightWall, heights[i], heights[i+1], ..., heights[n-1])
  const maxFromRight = new Array(n);
  maxFromRight[n - 1] = Math.max(rightWall, heights[n - 1]);
  for (let i = n - 2; i >= 0; i--) {
    maxFromRight[i] = Math.max(maxFromRight[i + 1], heights[i]);
  }

  // Calculate total water held
  let totalWater = 0;
  for (let i = 0; i < n; i++) {
    const waterLevel = Math.min(maxFromLeft[i], maxFromRight[i]);
    const waterHeld = waterLevel - heights[i];
    totalWater += waterHeld;
  }

  return totalWater;
}
