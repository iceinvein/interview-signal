export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = leftWall;
  let rightMax = rightWall;
  let held = 0;
  // Whichever side has the lower running maximum bounds the level on that
  // side, because the other side (wall included) reaches at least as high.
  while (left <= right) {
    if (leftMax <= rightMax) {
      leftMax = Math.max(leftMax, heights[left]);
      held += leftMax - heights[left];
      left++;
    } else {
      rightMax = Math.max(rightMax, heights[right]);
      held += rightMax - heights[right];
      right--;
    }
  }
  return held;
}
