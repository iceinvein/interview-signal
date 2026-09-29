Implement this function in `solution.ts`:

```ts
export function rainWater(heights: number[]): number;
```

A row of bars stands side by side, each of width 1; `heights[i]` is the height of bar `i`. After rain, water settles on top of the bars wherever it is held in by taller bars on both sides; water above the level of the lower of those two sides runs off, and water at either end of the row runs off the edge. Return the total number of units of water held across the whole row. Nothing lies beyond the first and last bars. If no water is held, return `0`.

Constraints:

- `0 <= heights.length <= 100000`
- `0 <= heights[i] <= 100000`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
