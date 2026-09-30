export function longestNonDecreasing(nums: number[]): number {
  // tails[i] = smallest possible tail of a non-decreasing subsequence of length i+1
  const tails: number[] = [];
  for (const x of nums) {
    // find first index with tails[idx] > x (upper bound)
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}
