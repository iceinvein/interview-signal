export function longestNonDecreasing(nums: number[]): number {
  // smallestTail[k] is the smallest value that ends a non-decreasing
  // subsequence of length k + 1 seen so far; it stays sorted. Searching
  // past equal tails lets a repeated value extend the run.
  const smallestTail: number[] = [];
  for (const value of nums) {
    let low = 0;
    let high = smallestTail.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (smallestTail[mid] <= value) low = mid + 1;
      else high = mid;
    }
    smallestTail[low] = value;
  }
  return smallestTail.length;
}
