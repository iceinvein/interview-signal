export function slidingWindowRange(nums: number[], k: number): number[] {
  const n = nums.length;
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let maxH = 0, maxT = 0, minH = 0, minT = 0;
  const res: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = nums[i];
    while (maxT > maxH && nums[maxQ[maxT - 1]] <= v) maxT--;
    maxQ[maxT++] = i;
    while (minT > minH && nums[minQ[minT - 1]] >= v) minT--;
    minQ[minT++] = i;
    const start = i - k + 1;
    if (start < 0) continue;
    if (maxQ[maxH] < start) maxH++;
    if (minQ[minH] < start) minH++;
    res.push(nums[maxQ[maxH]] - nums[minQ[minH]]);
  }
  return res;
}
