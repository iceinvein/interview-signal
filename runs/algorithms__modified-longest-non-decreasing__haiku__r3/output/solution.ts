export function longestNonDecreasing(nums: number[]): number {
  const tail: number[] = [];

  for (const num of nums) {
    // Binary search to find the leftmost position where tail[pos] > num
    let left = 0, right = tail.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (tail[mid] <= num) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Update or extend the tail array
    if (left < tail.length) {
      tail[left] = num;
    } else {
      tail.push(num);
    }
  }

  return tail.length;
}
