export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const seen = new Uint8Array(rows * cols);
  const stack = new Int32Array(rows * cols);
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (grid[r][c] !== 1 || seen[start]) continue;
      count++;
      seen[start] = 1;
      let sp = 0;
      stack[sp++] = start;
      while (sp > 0) {
        const cur = stack[--sp];
        const cr = (cur / cols) | 0;
        const cc = cur - cr * cols;
        if (cr > 0 && grid[cr - 1][cc] === 1 && !seen[cur - cols]) {
          seen[cur - cols] = 1;
          stack[sp++] = cur - cols;
        }
        if (cr < rows - 1 && grid[cr + 1][cc] === 1 && !seen[cur + cols]) {
          seen[cur + cols] = 1;
          stack[sp++] = cur + cols;
        }
        if (cc > 0 && grid[cr][cc - 1] === 1 && !seen[cur - 1]) {
          seen[cur - 1] = 1;
          stack[sp++] = cur - 1;
        }
        if (cc < cols - 1 && grid[cr][cc + 1] === 1 && !seen[cur + 1]) {
          seen[cur + 1] = 1;
          stack[sp++] = cur + 1;
        }
      }
    }
  }
  return count;
}
