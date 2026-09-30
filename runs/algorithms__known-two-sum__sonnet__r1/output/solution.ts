export function twoSum(nums: number[], target: number): [number, number] {
  const seen = new Map<number, number>();
  for (let j = 0; j < nums.length; j++) {
    const i = seen.get(target - nums[j]);
    if (i !== undefined) return [i, j];
    seen.set(nums[j], j);
  }
  throw new Error("No solution");
}
