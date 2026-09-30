export function lengthOfLIS(nums: number[]): number {
  const tails: number[] = [];

  for (const num of nums) {
    // Binary search to find the leftmost position where tails[pos] >= num
    let left = 0, right = tails.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (tails[mid] < num) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Place num at position left
    // - If left === tails.length, num extends the longest sequence
    // - Otherwise, num can replace a larger element that had the same length
    tails[left] = num;
  }

  return tails.length;
}
