Implement this function in `solution.ts`:

```ts
export function cheapestLevel(heights: number[], raiseCost: number, lowerCost: number): number;
```

You are given the heights of several columns and must bring them all to one common integer level `L` of your choice. Every column shorter than `L` is raised to `L`, costing `raiseCost` per unit of height added. Every column taller than `L` is lowered to `L`, costing `lowerCost` per unit of height removed. Columns already at `L` cost nothing. Return the smallest total cost over all integer choices of `L`.

Example: for `heights = [1, 2, 3, 4, 5]`, `raiseCost = 2` and `lowerCost = 1`, choosing `L = 2` raises the first column by 1 (cost 2) and lowers the last three by 1, 2 and 3 (cost 6), for a total of `8`. Every other level costs more, so the answer is `8`.

Constraints:

- `1 <= heights.length <= 200000`
- `0 <= heights[i] <= 10^6`, all integers, in any order.
- `1 <= raiseCost, lowerCost <= 1000`, integers.
- The answer stays below `2^53`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
