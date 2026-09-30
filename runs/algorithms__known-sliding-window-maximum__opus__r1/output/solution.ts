export function maxSlidingWindow(nums: number[], k: number): number[] {
  const n = nums.length;
  const result: number[] = new Array(n - k + 1);
  // Monotonic deque of indices; values at these indices are strictly decreasing.
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < n; i++) {
    const v = nums[i];
    while (tail > head && nums[deque[tail - 1]] <= v) tail--;
    deque[tail++] = i;
    if (deque[head] <= i - k) head++;
    if (i >= k - 1) result[i - k + 1] = nums[deque[head]];
  }

  return result;
}
