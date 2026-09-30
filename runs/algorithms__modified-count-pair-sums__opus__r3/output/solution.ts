export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let count = 0;
  for (const x of nums) {
    count += seen.get(target - x) ?? 0;
    seen.set(x, (seen.get(x) ?? 0) + 1);
  }
  return count;
}
