export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let result = 0;

  for (const num of nums) {
    const complement = target - num;
    if (seen.has(complement)) {
      result += seen.get(complement)!;
    }
    seen.set(num, (seen.get(num) ?? 0) + 1);
  }

  return result;
}
