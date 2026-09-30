export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  const columns = grid[0].length;
  const visited = new Uint8Array(rows * columns);
  const stack: number[] = [];
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const start = row * columns + column;
      if (grid[row][column] === 0 || visited[start]) continue;

      islands++;
      visited[start] = 1;
      stack.push(start);

      while (stack.length > 0) {
        const cell = stack.pop()!;
        const r = Math.floor(cell / columns);
        const c = cell % columns;

        if (r > 0) {
          const next = cell - columns;
          if (!visited[next] && grid[r - 1][c] === 1) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (r + 1 < rows) {
          const next = cell + columns;
          if (!visited[next] && grid[r + 1][c] === 1) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (c > 0) {
          const next = cell - 1;
          if (!visited[next] && grid[r][c - 1] === 1) {
            visited[next] = 1;
            stack.push(next);
          }
        }
        if (c + 1 < columns) {
          const next = cell + 1;
          if (!visited[next] && grid[r][c + 1] === 1) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
  }

  return islands;
}
