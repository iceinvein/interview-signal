export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  if (rows === 0) return 0;
  const cols = grid[0].length;
  if (cols === 0) return 0;

  const total = rows * cols;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let islands = 0;

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (row[c] !== 1 || visited[start]) continue;

      islands++;
      visited[start] = 1;
      let top = 0;
      stack[top++] = start;

      while (top > 0) {
        const idx = stack[--top];
        const cr = (idx / cols) | 0;
        const cc = idx - cr * cols;

        if (cr > 0) {
          const n = idx - cols;
          if (!visited[n] && grid[cr - 1][cc] === 1) {
            visited[n] = 1;
            stack[top++] = n;
          }
        }
        if (cr < rows - 1) {
          const n = idx + cols;
          if (!visited[n] && grid[cr + 1][cc] === 1) {
            visited[n] = 1;
            stack[top++] = n;
          }
        }
        if (cc > 0) {
          const n = idx - 1;
          if (!visited[n] && grid[cr][cc - 1] === 1) {
            visited[n] = 1;
            stack[top++] = n;
          }
        }
        if (cc < cols - 1) {
          const n = idx + 1;
          if (!visited[n] && grid[cr][cc + 1] === 1) {
            visited[n] = 1;
            stack[top++] = n;
          }
        }
      }
    }
  }

  return islands;
}
