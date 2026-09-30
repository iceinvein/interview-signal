export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Uint8Array(rows * cols);
  const stack: number[] = [];
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const start = row * cols + col;
      if (grid[row][col] === 0 || visited[start]) continue;

      islands++;
      visited[start] = 1;
      stack.push(start);

      while (stack.length > 0) {
        const cell = stack.pop()!;
        const r = Math.floor(cell / cols);
        const c = cell % cols;

        if (r > 0) {
          const next = cell - cols;
          if (grid[r - 1][c] === 1 && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (r + 1 < rows) {
          const next = cell + cols;
          if (grid[r + 1][c] === 1 && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (c > 0) {
          const next = cell - 1;
          if (grid[r][c - 1] === 1 && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (c + 1 < cols) {
          const next = cell + 1;
          if (grid[r][c + 1] === 1 && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
  }

  return islands;
}
