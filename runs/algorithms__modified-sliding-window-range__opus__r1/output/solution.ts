export function slidingWindowRange(nums: number[], k: number): number[] {
  const n = nums.length;
  const result: number[] = new Array(n - k + 1);
  // Monotonic deques of indices, implemented as arrays with head pointers.
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let maxHead = 0, maxTail = 0;
  let minHead = 0, minTail = 0;

  for (let i = 0; i < n; i++) {
    const x = nums[i];
    while (maxTail > maxHead && nums[maxQ[maxTail - 1]] <= x) maxTail--;
    maxQ[maxTail++] = i;
    while (minTail > minHead && nums[minQ[minTail - 1]] >= x) minTail--;
    minQ[minTail++] = i;

    const start = i - k + 1;
    if (start >= 0) {
      if (maxQ[maxHead] < start) maxHead++;
      if (minQ[minHead] < start) minHead++;
      result[start] = nums[maxQ[maxHead]] - nums[minQ[minHead]];
    }
  }
  return result;
}
