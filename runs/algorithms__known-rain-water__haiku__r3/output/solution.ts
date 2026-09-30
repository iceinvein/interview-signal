export function rainWater(heights: number[]): number {
  if (heights.length === 0) return 0;

  let left = 0;
  let right = heights.length - 1;
  let maxLeft = 0;
  let maxRight = 0;
  let totalWater = 0;

  while (left <= right) {
    if (heights[left] < heights[right]) {
      if (heights[left] >= maxLeft) {
        maxLeft = heights[left];
      } else {
        totalWater += maxLeft - heights[left];
      }
      left++;
    } else {
      if (heights[right] >= maxRight) {
        maxRight = heights[right];
      } else {
        totalWater += maxRight - heights[right];
      }
      right--;
    }
  }

  return totalWater;
}
