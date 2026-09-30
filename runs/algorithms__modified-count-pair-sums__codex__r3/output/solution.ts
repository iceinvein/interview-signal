export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let pairs = 0;

  for (const num of nums) {
    pairs += seen.get(target - num) ?? 0;
    seen.set(num, (seen.get(num) ?? 0) + 1);
  }

  return pairs;
}
