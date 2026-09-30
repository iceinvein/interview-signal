export function lengthOfLIS(nums: number[]): number {
  const tails: number[] = [];

  for (const value of nums) {
    let left = 0;
    let right = tails.length;

    // Find the first tail that is at least value. Replacing it keeps
    // future increasing subsequences as easy to extend as possible.
    while (left < right) {
      const mid = left + Math.floor((right - left) / 2);
      if (tails[mid] < value) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    tails[left] = value;
  }

  return tails.length;
}
