export function maxSlidingWindow(nums: number[], k: number): number[] {
  const result: number[] = [];
  const deque: number[] = [];
  let head = 0;

  for (let i = 0; i < nums.length; i++) {
    // Discard indices that have left the current window.
    if (head < deque.length && deque[head] <= i - k) {
      head++;
    }

    // Any smaller or equal value can never be a future window's maximum.
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
