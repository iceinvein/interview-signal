export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let count = 0;
  for (const x of nums) {
    const complement = target - x;
    count += seen.get(complement) ?? 0;
    seen.set(x, (seen.get(x) ?? 0) + 1);
  }
  return count;
}
