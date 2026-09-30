export function rainWater(heights: number[]): number {
  let l = 0;
  let r = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let total = 0;
  while (l < r) {
    if (heights[l] < heights[r]) {
      if (heights[l] >= leftMax) leftMax = heights[l];
      else total += leftMax - heights[l];
      l++;
    } else {
      if (heights[r] >= rightMax) rightMax = heights[r];
      else total += rightMax - heights[r];
      r--;
    }
  }
  return total;
}
