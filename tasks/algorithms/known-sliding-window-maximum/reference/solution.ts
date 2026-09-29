export function maxSlidingWindow(nums: number[], k: number): number[] {
  // Positions whose values strictly decrease from head to tail; the head is
  // always the current window's maximum.
  const deque = new Int32Array(nums.length);
  let head = 0;
  let tail = 0;
  const result: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    while (tail > head && nums[deque[tail - 1]] <= nums[i]) tail--;
    deque[tail++] = i;
    if (deque[head] <= i - k) head++;
    if (i >= k - 1) result.push(nums[deque[head]]);
  }
  return result;
}
