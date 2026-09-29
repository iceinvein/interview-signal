Implement this function in `solution.ts`:

```ts
export function maxSlidingWindow(nums: number[], k: number): number[];
```

You are given an array of integers `nums` and a window size `k`. Consider every block of `k` consecutive elements of `nums`, from the block starting at position `0` to the block ending at the last position. Return an array holding the largest value of each block, in order from left to right. The result therefore has `nums.length - k + 1` entries, and entry `i` is the largest of `nums[i]` to `nums[i + k - 1]` inclusive.

Constraints:

- `1 <= nums.length <= 100000`
- `1 <= k <= nums.length`
- `-10^4 <= nums[i] <= 10^4`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
