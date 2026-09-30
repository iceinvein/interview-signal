export function lengthOfLIS(nums: number[]): number {
  const tails: number[] = [];

  for (const num of nums) {
    let left = 0;
    let right = tails.length;

    // Find the first tail that is at least num. Replacing it keeps future
    // extension options open; equal values do not extend a subsequence.
    while (left < right) {
      const mid = left + Math.floor((right - left) / 2);
      if (tails[mid] < num) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    tails[left] = num;
  }

  return tails.length;
}
