Implement this function in `solution.ts`:

```ts
export function countIslands(grid: number[][]): number;
```

You are given a rectangular grid where each cell is `0` (water) or `1` (land). Two land cells belong to the same island when you can walk from one to the other through land cells, each step moving up, down, left or right to a neighbouring cell. Diagonal steps do not count. Everything outside the grid is water, so the grid does not wrap around at its edges. Return the number of islands.

Constraints:

- `1 <= grid.length <= 1000` (rows)
- `1 <= grid[r].length <= 1000` (columns), the same for every row
- Every cell is `0` or `1`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
