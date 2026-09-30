export function longestNonDecreasing(nums: number[]): number {
  // tails[k] = smallest possible last value of a non-decreasing subsequence of length k+1
  const tails: number[] = [];
  for (const x of nums) {
    // find first index with tails[idx] > x (upper bound)
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    tails[lo] = x;
  }
  return tails.length;
}
