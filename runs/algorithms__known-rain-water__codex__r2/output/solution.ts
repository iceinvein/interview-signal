export function rainWater(heights: number[]): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let total = 0;

  while (left <= right) {
    if (leftMax <= rightMax) {
      leftMax = Math.max(leftMax, heights[left]);
      total += leftMax - heights[left];
      left++;
    } else {
      rightMax = Math.max(rightMax, heights[right]);
      total += rightMax - heights[right];
      right--;
    }
  }

  return total;
}
