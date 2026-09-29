Implement this function in `solution.ts`:

```ts
export function twoSum(nums: number[], target: number): [number, number];
```

You are given an array of integers `nums` and an integer `target`. Exactly one pair of different positions `i` and `j` has `nums[i] + nums[j] === target`. Return that pair of positions as `[i, j]` with `i < j`.

Constraints:

- `2 <= nums.length <= 100000`
- `-10^9 <= nums[i], target <= 10^9`
- Exactly one valid pair exists. The same position may not be used twice, but two positions may hold equal values.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
