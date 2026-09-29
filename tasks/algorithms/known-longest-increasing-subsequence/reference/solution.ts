export function lengthOfLIS(nums: number[]): number {
  // smallestTail[k] is the smallest value that ends an increasing
  // subsequence of length k + 1 seen so far; it stays sorted.
  const smallestTail: number[] = [];
  for (const value of nums) {
    let low = 0;
    let high = smallestTail.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (smallestTail[mid] < value) low = mid + 1;
      else high = mid;
    }
    smallestTail[low] = value;
  }
  return smallestTail.length;
}
