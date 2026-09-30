export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  let l = 0;
  let r = heights.length - 1;
  let leftMax = leftWall;
  let rightMax = rightWall;
  let total = 0;
  while (l <= r) {
    if (heights[l] > leftMax) leftMax = heights[l];
    if (heights[r] > rightMax) rightMax = heights[r];
    if (leftMax <= rightMax) {
      // The true right-side max for bar l is at least rightMax >= leftMax.
      total += leftMax - heights[l];
      l++;
    } else {
      total += rightMax - heights[r];
      r--;
    }
  }
  return total;
}
