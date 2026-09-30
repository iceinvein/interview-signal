export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = leftWall;
  let rightMax = rightWall;
  let water = 0;

  while (left <= right) {
    if (leftMax <= rightMax) {
      leftMax = Math.max(leftMax, heights[left]);
      water += leftMax - heights[left];
      left++;
    } else {
      rightMax = Math.max(rightMax, heights[right]);
      water += rightMax - heights[right];
      right--;
    }
  }

  return water;
}
