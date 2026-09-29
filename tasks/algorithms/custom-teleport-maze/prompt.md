Implement this function in `solution.ts`:

```ts
export function shortestTeleportPath(grid: string[]): number;
```

You are given a rectangular maze as a list of rows, all of the same length. Each character is one cell:

- `'S'`: the start (exactly one in the grid).
- `'E'`: the exit (exactly one in the grid).
- `'#'`: a wall, which can never be entered.
- `'.'`: open floor.
- a lowercase letter `'a'` to `'z'`: open floor that is also a portal. Each letter either does not appear at all or appears on exactly two cells, and those two cells are twins.

In one move you may either step to the cell directly above, below, left or right of you, provided it is inside the grid and not a wall, or, if you are standing on a portal cell, jump to its twin. Both kinds of move cost 1. Jumping is always optional: you may walk onto, across and off a portal cell without using it, and `'S'` and `'E'` behave as ordinary floor.

Return the smallest number of moves that takes you from `'S'` to `'E'`, or `-1` if `'E'` cannot be reached.

Example: in the single row `"Sa#a.E"` the wall blocks walking, but `S` to the first `a` (1), jump to the second `a` (2), then two steps right (4) reaches `E`, so the answer is `4`.

Constraints:

- `1 <= grid.length <= 1000` and `1 <= grid[i].length <= 1000`
- Every row has the same length and contains only the characters described above.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
