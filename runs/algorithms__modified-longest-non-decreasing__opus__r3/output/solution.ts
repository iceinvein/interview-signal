export function longestNonDecreasing(nums: number[]): number {
  // tails[k] = smallest possible tail of a non-decreasing subsequence of length k + 1
  const tails: number[] = [];
  for (const x of nums) {
    // upper bound: first index with tails[i] > x
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) tails.push(x);
    else tails[lo] = x;
  }
  return tails.length;
}
