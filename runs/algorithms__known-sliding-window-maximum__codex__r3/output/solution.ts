export function maxSlidingWindow(nums: number[], k: number): number[] {
  const deque: number[] = [];
  const result: number[] = [];
  let head = 0;

  for (let i = 0; i < nums.length; i++) {
    // Indices before the current window can no longer be maxima.
    if (head < deque.length && deque[head] <= i - k) {
      head++;
    }

    // Smaller values behind nums[i] will never be needed again.
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
