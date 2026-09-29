Implement this function in `solution.ts`:

```ts
export function rainWaterWithWalls(heights: number[], leftWall: number, rightWall: number): number;
```

A row of bars stands side by side, each of width 1; `heights[i]` is the height of bar `i`. The row sits between two walls: one of height `leftWall` immediately before bar `0`, and one of height `rightWall` immediately after the last bar. A wall of height `0` means that side is open. The walls themselves hold no water on their far sides; they only hold water in over the bars.

After rain, water settles over each bar up to a level set by the tallest thing on each side of it, whichever side is lower. Precisely, with `n = heights.length`, the water level over bar `i` is

`min(max(leftWall, heights[0], ..., heights[i]), max(rightWall, heights[i], ..., heights[n - 1]))`

and the water held over bar `i` is that level minus `heights[i]`. Return the total water held over all bars. If `heights` is empty, return `0`.

Constraints:

- `0 <= heights.length <= 100000`
- `0 <= heights[i] <= 100000`
- `0 <= leftWall, rightWall <= 100000`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
