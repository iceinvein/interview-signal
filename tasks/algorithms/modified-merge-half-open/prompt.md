Implement this function in `solution.ts`:

```ts
export function mergeHalfOpen(intervals: [number, number][]): [number, number][];
```

You are given a list of half-open intervals. Each interval `[start, end]` covers every point `x` with `start <= x < end`: the start is included and the end is not. Every interval has `start <= end`, and the intervals may arrive in any order.

Two intervals are combined only when they share at least one point. Intervals that merely touch, such as `[1, 3]` and `[3, 5]`, share no point (`3` belongs to the second but not the first), so they stay separate. An interval with `start === end` covers no points at all: leave it out of the result, and never let it join or bridge other intervals. Combine every group of intervals that share points into a single interval covering exactly their union, and repeat until no two intervals in the result share a point.

Return the combined intervals sorted by `start` in ascending order. If the input is empty, or every interval covers no points, return an empty list.

Constraints:

- `0 <= intervals.length <= 100000`
- `0 <= start <= end <= 10^9`, all integers
- The same interval may appear more than once.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
