export function slidingWindowRange(nums: number[], k: number): number[] {
  const result: number[] = [];
  const maxDeque: number[] = []; // indices of potential maximums
  const minDeque: number[] = []; // indices of potential minimums

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside current window from maxDeque
    while (maxDeque.length > 0 && maxDeque[0] < i - k + 1) {
      maxDeque.shift();
    }

    // Remove elements smaller than current from back of maxDeque
    while (maxDeque.length > 0 && nums[maxDeque[maxDeque.length - 1]] < nums[i]) {
      maxDeque.pop();
    }
    maxDeque.push(i);

    // Remove indices outside current window from minDeque
    while (minDeque.length > 0 && minDeque[0] < i - k + 1) {
      minDeque.shift();
    }

    // Remove elements larger than current from back of minDeque
    while (minDeque.length > 0 && nums[minDeque[minDeque.length - 1]] > nums[i]) {
      minDeque.pop();
    }
    minDeque.push(i);

    // Once window is full, compute and record the range
    if (i >= k - 1) {
      const maxVal = nums[maxDeque[0]];
      const minVal = nums[minDeque[0]];
      result.push(maxVal - minVal);
    }
  }

  return result;
}
