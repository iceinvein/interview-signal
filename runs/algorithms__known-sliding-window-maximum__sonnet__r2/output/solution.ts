export function maxSlidingWindow(nums: number[], k: number): number[] {
  const n = nums.length;
  const result: number[] = new Array(n - k + 1);
  // Monotonic deque of indices with decreasing values.
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (head < tail && dq[head] <= i - k) head++;
    while (head < tail && nums[dq[tail - 1]] <= nums[i]) tail--;
    dq[tail++] = i;
    if (i >= k - 1) result[i - k + 1] = nums[dq[head]];
  }
  return result;
}
