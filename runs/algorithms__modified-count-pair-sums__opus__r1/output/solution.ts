export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let count = 0;
  for (const x of nums) {
    const c = seen.get(target - x);
    if (c !== undefined) count += c;
    seen.set(x, (seen.get(x) ?? 0) + 1);
  }
  return count;
}
