export function slidingWindowRange(nums: number[], k: number): number[] {
  const n = nums.length;
  const result: number[] = new Array(n - k + 1);
  // Deques of indices stored in typed arrays with head/tail pointers.
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let maxHead = 0, maxTail = 0;
  let minHead = 0, minTail = 0;

  for (let i = 0; i < n; i++) {
    const v = nums[i];
    while (maxTail > maxHead && nums[maxQ[maxTail - 1]] <= v) maxTail--;
    maxQ[maxTail++] = i;
    while (minTail > minHead && nums[minQ[minTail - 1]] >= v) minTail--;
    minQ[minTail++] = i;

    const start = i - k + 1;
    if (maxQ[maxHead] < start) maxHead++;
    if (minQ[minHead] < start) minHead++;
    if (start >= 0) result[start] = nums[maxQ[maxHead]] - nums[minQ[minHead]];
  }
  return result;
}
