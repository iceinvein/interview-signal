export function countIslandsTorus(grid: number[][]): number {
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
      const up = (r + rows - 1) % rows;
      const down = (r + 1) % rows;
      const left = (c + cols - 1) % cols;
      const right = (c + 1) % cols;
      const neighbours = [up * cols + c, down * cols + c, r * cols + left, r * cols + right];
      for (const next of neighbours) {
        if (seen[next] === 0 && grid[Math.floor(next / cols)][next % cols] === 1) {
          seen[next] = 1;
          stack[top++] = next;
        }
      }
    }
  }
  return islands;
}
