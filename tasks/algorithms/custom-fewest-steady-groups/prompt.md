Implement this function in `solution.ts`:

```ts
export function fewestSteadyGroups(scores: number[], maxSpread: number): number;
```

Split the sequence `scores` into contiguous groups, keeping the original order, so that every score belongs to exactly one group. A group is steady when its largest score minus its smallest score is at most `maxSpread` (a group of one score is always steady). Return the smallest number of groups in a split where every group is steady. An empty sequence needs `0` groups.

Example: for `scores = [1, 5, 2, 6]` and `maxSpread = 4`, the split `[1, 5, 2] [6]` works (spreads 4 and 0), and the whole sequence as one group has spread 5, which is too large. The answer is `2`.

Constraints:

- `0 <= scores.length <= 200000`
- `-10^9 <= scores[i] <= 10^9`, integers
- `0 <= maxSpread <= 2 * 10^9`, integer

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
