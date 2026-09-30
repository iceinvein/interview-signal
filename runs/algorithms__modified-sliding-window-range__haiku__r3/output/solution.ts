export function slidingWindowRange(nums: number[], k: number): number[] {
  const result: number[] = [];
  const maxDeque: number[] = [];
  const minDeque: number[] = [];

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside the current window
    while (maxDeque.length > 0 && maxDeque[0] < i - k + 1) {
      maxDeque.shift();
    }
    while (minDeque.length > 0 && minDeque[0] < i - k + 1) {
      minDeque.shift();
    }

    // Maintain decreasing order in maxDeque (front element has max value)
    while (maxDeque.length > 0 && nums[maxDeque[maxDeque.length - 1]] <= nums[i]) {
      maxDeque.pop();
    }
    maxDeque.push(i);

    // Maintain increasing order in minDeque (front element has min value)
    while (minDeque.length > 0 && nums[minDeque[minDeque.length - 1]] >= nums[i]) {
      minDeque.pop();
    }
    minDeque.push(i);

    // Once we have a complete window, compute the difference
    if (i >= k - 1) {
      const max = nums[maxDeque[0]];
      const min = nums[minDeque[0]];
      result.push(max - min);
    }
  }

  return result;
}
