export function longestNonDecreasing(nums: number[]): number {
  const tails: number[] = [];

  for (const num of nums) {
    // Binary search for the first position where tails[i] > num
    let left = 0, right = tails.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (tails[mid] <= num) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Extend the subsequence or update the tail
    if (left === tails.length) {
      tails.push(num);
    } else {
      tails[left] = num;
    }
  }

  return tails.length;
}
