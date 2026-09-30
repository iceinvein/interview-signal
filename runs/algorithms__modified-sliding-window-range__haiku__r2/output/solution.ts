export function slidingWindowRange(nums: number[], k: number): number[] {
  const result: number[] = [];
  const maxDeque: number[] = []; // stores indices of potential maximums
  const minDeque: number[] = []; // stores indices of potential minimums

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside the current window from the front
    if (maxDeque.length > 0 && maxDeque[0] < i - k + 1) {
      maxDeque.shift();
    }
    if (minDeque.length > 0 && minDeque[0] < i - k + 1) {
      minDeque.shift();
    }

    // Maintain max deque in decreasing order of values
    while (maxDeque.length > 0 && nums[maxDeque[maxDeque.length - 1]] <= nums[i]) {
      maxDeque.pop();
    }
    maxDeque.push(i);

    // Maintain min deque in increasing order of values
    while (minDeque.length > 0 && nums[minDeque[minDeque.length - 1]] >= nums[i]) {
      minDeque.pop();
    }
    minDeque.push(i);

    // Once we have a complete window, compute the difference
    if (i >= k - 1) {
      result.push(nums[maxDeque[0]] - nums[minDeque[0]]);
    }
  }

  return result;
}
