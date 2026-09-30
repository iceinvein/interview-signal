export function maxSlidingWindow(nums: number[], k: number): number[] {
  const result: number[] = [];
  const deque: number[] = [];
  let head = 0;

  for (let i = 0; i < nums.length; i++) {
    // Indices before the current window can no longer contribute its maximum.
    if (head < deque.length && deque[head] <= i - k) {
      head++;
    }

    // Keep candidate values in decreasing order from front to back.
    while (deque.length > head && nums[deque[deque.length - 1]] <= nums[i]) {
      deque.pop();
    }
    deque.push(i);

    if (i >= k - 1) {
      result.push(nums[deque[head]]);
    }
  }

  return result;
}
