export function countPairsWithSum(nums: number[], target: number): number {
  const seen = new Map<number, number>();
  let count = 0;
  for (const n of nums) {
    const c = seen.get(target - n);
    if (c !== undefined) count += c;
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return count;
}
