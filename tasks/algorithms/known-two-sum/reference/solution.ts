export function twoSum(nums: number[], target: number): [number, number] {
  const seenAt = new Map<number, number>();
  for (let j = 0; j < nums.length; j++) {
    const i = seenAt.get(target - nums[j]);
    if (i !== undefined) return [i, j];
    if (!seenAt.has(nums[j])) seenAt.set(nums[j], j);
  }
  throw new Error("no pair sums to target");
}
