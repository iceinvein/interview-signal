export function slidingWindowRange(nums: number[], k: number): number[] {
  const n = nums.length;
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let mh = 0, mt = 0, nh = 0, nt = 0;
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    while (mt > mh && nums[maxQ[mt - 1]] <= nums[i]) mt--;
    maxQ[mt++] = i;
    while (nt > nh && nums[minQ[nt - 1]] >= nums[i]) nt--;
    minQ[nt++] = i;
    const start = i - k + 1;
    if (start < 0) continue;
    while (maxQ[mh] < start) mh++;
    while (minQ[nh] < start) nh++;
    result.push(nums[maxQ[mh]] - nums[minQ[nh]]);
  }
  return result;
}
