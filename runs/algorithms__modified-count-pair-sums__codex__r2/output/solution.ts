export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let pairs = 0;

  for (const value of nums) {
    pairs += seen.get(target - value) ?? 0;
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }

  return pairs;
}
