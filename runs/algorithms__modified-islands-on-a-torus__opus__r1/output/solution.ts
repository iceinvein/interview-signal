export function countIslandsTorus(grid: number[][]): number {
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
        const up = cr === 0 ? rows - 1 : cr - 1;
        const down = cr === rows - 1 ? 0 : cr + 1;
        const left = cc === 0 ? cols - 1 : cc - 1;
        const right = cc === cols - 1 ? 0 : cc + 1;
        const nbrs = [
          up * cols + cc,
          down * cols + cc,
          cr * cols + left,
          cr * cols + right,
        ];
        for (let k = 0; k < 4; k++) {
          const n = nbrs[k];
          if (visited[n]) continue;
          const nr = (n / cols) | 0;
          if (grid[nr][n - nr * cols] !== 1) continue;
          visited[n] = 1;
          stack[top++] = n;
        }
      }
    }
  }
  return islands;
}
