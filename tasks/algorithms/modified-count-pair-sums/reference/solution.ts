export function countPairsWithSum(nums: number[], target: number): number {
  const seenCount = new Map<number, number>();
  let pairs = 0;
  for (const value of nums) {
    pairs += seenCount.get(target - value) ?? 0;
    seenCount.set(value, (seenCount.get(value) ?? 0) + 1);
  }
  return pairs;
}
