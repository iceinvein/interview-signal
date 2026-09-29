Implement this function in `solution.ts`:

```ts
export function countPairsWithSum(nums: number[], target: number): number;
```

You are given an array of integers `nums` and an integer `target`. Return how many pairs of positions `i` and `j` with `i < j` satisfy `nums[i] + nums[j] === target`. Pairs are counted by position, not by value: two pairs that use the same values at different positions are counted separately. A position may not be paired with itself. If no pair qualifies, return `0`.

Constraints:

- `0 <= nums.length <= 100000`
- `-10^9 <= nums[i], target <= 10^9`
- The count can be as large as about `5 * 10^9`; return it exactly as a `number`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
