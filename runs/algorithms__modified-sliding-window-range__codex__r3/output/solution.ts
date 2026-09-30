export function slidingWindowRange(nums: number[], k: number): number[] {
  const maxDeque: number[] = [];
  const minDeque: number[] = [];
  let maxHead = 0;
  let minHead = 0;
  const ranges: number[] = [];

  for (let i = 0; i < nums.length; i++) {
    const windowStart = i - k + 1;

    if (maxHead < maxDeque.length && maxDeque[maxHead] < windowStart) {
      maxHead++;
    }
    if (minHead < minDeque.length && minDeque[minHead] < windowStart) {
      minHead++;
    }

    while (maxDeque.length > maxHead && nums[maxDeque[maxDeque.length - 1]] <= nums[i]) {
      maxDeque.pop();
    }
    maxDeque.push(i);

    while (minDeque.length > minHead && nums[minDeque[minDeque.length - 1]] >= nums[i]) {
      minDeque.pop();
    }
    minDeque.push(i);

    if (windowStart >= 0) {
      ranges.push(nums[maxDeque[maxHead]] - nums[minDeque[minHead]]);
    }
  }

  return ranges;
}
