Implement this function in `solution.ts`:

```ts
export function longestNonDecreasing(nums: number[]): number;
```

You are given an array of integers `nums`. A subsequence keeps some of the elements in their original order, not necessarily next to each other. Return the length of the longest subsequence in which every element is greater than or equal to the one before it. Equal values may follow each other, so `[2, 2, 2]` has a longest such subsequence of length `3`.

Constraints:

- `1 <= nums.length <= 100000`
- `-10^9 <= nums[i] <= 10^9`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
