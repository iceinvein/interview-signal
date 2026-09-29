export function rainWater(heights: number[]): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let held = 0;
  // Whichever side has the lower running maximum bounds the level on that
  // side, because the other side is known to reach at least as high.
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
