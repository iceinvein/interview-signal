export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let count = 0;

  for (const num of nums) {
    const complement = target - num;
    if (seen.has(complement)) {
      count += seen.get(complement)!;
    }
    seen.set(num, (seen.get(num) ?? 0) + 1);
  }

  return count;
}
