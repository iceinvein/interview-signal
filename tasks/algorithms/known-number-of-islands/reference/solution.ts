export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const seen = new Uint8Array(rows * cols);
  // An explicit stack, because an island can hold every cell and recursion that deep overflows.
  const stack = new Int32Array(rows * cols);
  let islands = 0;
  for (let start = 0; start < rows * cols; start++) {
    if (seen[start] === 1 || grid[Math.floor(start / cols)][start % cols] !== 1) continue;
    islands++;
    seen[start] = 1;
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const cell = stack[--top];
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      if (r > 0 && seen[cell - cols] === 0 && grid[r - 1][c] === 1) {
        seen[cell - cols] = 1;
        stack[top++] = cell - cols;
      }
      if (r < rows - 1 && seen[cell + cols] === 0 && grid[r + 1][c] === 1) {
        seen[cell + cols] = 1;
        stack[top++] = cell + cols;
      }
      if (c > 0 && seen[cell - 1] === 0 && grid[r][c - 1] === 1) {
        seen[cell - 1] = 1;
        stack[top++] = cell - 1;
      }
      if (c < cols - 1 && seen[cell + 1] === 0 && grid[r][c + 1] === 1) {
        seen[cell + 1] = 1;
        stack[top++] = cell + 1;
      }
    }
  }
  return islands;
}
