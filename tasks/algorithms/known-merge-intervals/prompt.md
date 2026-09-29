Implement this function in `solution.ts`:

```ts
export function mergeIntervals(intervals: [number, number][]): [number, number][];
```

You are given a list of closed intervals. Each interval `[start, end]` covers every point from `start` to `end`, both ends included, and has `start <= end`. The intervals may arrive in any order. Combine every group of intervals that share at least one point into a single interval covering exactly their union, and repeat until no two intervals in the result share a point. Intervals that only touch at an end, such as `[1, 2]` and `[2, 3]`, share the point `2` and so combine into `[1, 3]`.

Return the combined intervals sorted by `start` in ascending order. An empty input gives an empty result.

Constraints:

- `0 <= intervals.length <= 100000`
- `0 <= start <= end <= 10^9`, all integers
- The same interval may appear more than once.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
