export function lengthOfLIS(nums: number[]): number {
  // tails[k] = smallest possible tail of a strictly increasing subsequence of length k + 1
  const tails = new Float64Array(nums.length);
  let len = 0;
  for (const x of nums) {
    // Lower bound: first index with tails[i] >= x (strict increase)
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
    if (lo === len) len++;
  }
  return len;
}
