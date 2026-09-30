export function slidingWindowRange(nums: number[], k: number): number[] {
  const maxQueue: number[] = [];
  const minQueue: number[] = [];
  let maxHead = 0;
  let minHead = 0;
  const result: number[] = [];

  for (let i = 0; i < nums.length; i++) {
    const expired = i - k;
    if (maxHead < maxQueue.length && maxQueue[maxHead] <= expired) maxHead++;
    if (minHead < minQueue.length && minQueue[minHead] <= expired) minHead++;

    while (maxQueue.length > maxHead && nums[maxQueue[maxQueue.length - 1]] <= nums[i]) {
      maxQueue.pop();
    }
    while (minQueue.length > minHead && nums[minQueue[minQueue.length - 1]] >= nums[i]) {
      minQueue.pop();
    }

    maxQueue.push(i);
    minQueue.push(i);

    if (i >= k - 1) {
      result.push(nums[maxQueue[maxHead]] - nums[minQueue[minHead]]);
    }
  }

  return result;
}
