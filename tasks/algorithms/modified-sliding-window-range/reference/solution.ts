export function slidingWindowRange(nums: number[], k: number): number[] {
  // Two monotonic queues of positions: the head of maxQueue is the window's
  // maximum and the head of minQueue its minimum.
  const maxQueue = new Int32Array(nums.length);
  const minQueue = new Int32Array(nums.length);
  let maxHead = 0;
  let maxTail = 0;
  let minHead = 0;
  let minTail = 0;
  const result: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    while (maxTail > maxHead && nums[maxQueue[maxTail - 1]] <= nums[i]) maxTail--;
    maxQueue[maxTail++] = i;
    while (minTail > minHead && nums[minQueue[minTail - 1]] >= nums[i]) minTail--;
    minQueue[minTail++] = i;
    if (maxQueue[maxHead] <= i - k) maxHead++;
    if (minQueue[minHead] <= i - k) minHead++;
    if (i >= k - 1) result.push(nums[maxQueue[maxHead]] - nums[minQueue[minHead]]);
  }
  return result;
}
