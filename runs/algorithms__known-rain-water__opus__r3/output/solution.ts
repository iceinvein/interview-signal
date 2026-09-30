export function rainWater(heights: number[]): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let total = 0;

  while (left < right) {
    if (heights[left] < heights[right]) {
      if (heights[left] >= leftMax) leftMax = heights[left];
      else total += leftMax - heights[left];
      left++;
    } else {
      if (heights[right] >= rightMax) rightMax = heights[right];
      else total += rightMax - heights[right];
      right--;
    }
  }

  return total;
}
