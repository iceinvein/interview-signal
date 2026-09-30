export function lengthOfLIS(nums: number[]): number {
  // tails[k] = smallest possible tail of a strictly increasing subsequence of length k + 1
  const tails: number[] = [];
  for (const x of nums) {
    // Find first index with tails[i] >= x (lower bound) so equal values replace, not extend
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}
