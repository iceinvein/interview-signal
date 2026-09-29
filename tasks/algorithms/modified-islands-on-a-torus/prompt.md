Implement this function in `solution.ts`:

```ts
export function countIslandsTorus(grid: number[][]): number;
```

You are given a rectangular grid where each cell is `0` (water) or `1` (land). The grid wraps around at its edges: in every row, the last cell is the right-hand neighbour of the first cell (and the first cell is the left-hand neighbour of the last), and in every column, the last cell is the neighbour below the first cell (and the first cell is the neighbour above the last).

Two land cells belong to the same island when you can walk from one to the other through land cells, each step moving up, down, left or right to a neighbouring cell, including across the wrapped edges. Diagonal steps do not count, whether or not they cross an edge. Return the number of islands.

In a grid with a single column, a cell's left and right neighbours are the cell itself; in a grid with a single row, its neighbours above and below are itself. A cell being its own neighbour joins nothing.

Constraints:

- `1 <= grid.length <= 1000` (rows)
- `1 <= grid[r].length <= 1000` (columns), the same for every row
- Every cell is `0` or `1`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
