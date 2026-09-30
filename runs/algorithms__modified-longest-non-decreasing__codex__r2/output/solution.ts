export function longestNonDecreasing(nums: number[]): number {
  const tails: number[] = [];

  for (const value of nums) {
    let left = 0;
    let right = tails.length;

    // Find the first tail strictly greater than value. Equal values can extend
    // a non-decreasing subsequence, so they must stay to the left of insertion.
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2);
      if (tails[middle] <= value) {
        left = middle + 1;
      } else {
        right = middle;
      }
    }

    tails[left] = value;
  }

  return tails.length;
}
