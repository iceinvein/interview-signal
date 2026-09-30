export function lengthOfLIS(nums: number[]): number {
  // tails[i] = smallest tail value of any strictly increasing subsequence of length i + 1
  const tails: number[] = [];
  for (const x of nums) {
    // Find first index with tails[idx] >= x (lower bound) for strict increase
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
