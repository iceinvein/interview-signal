export function countIslands(grid: number[][]): number {
  const rows = grid.length;
  const columns = grid[0].length;
  const total = rows * columns;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const start = row * columns + column;
      if (grid[row][column] === 0 || visited[start] !== 0) continue;

      islands++;
      let size = 0;
      stack[size++] = start;
      visited[start] = 1;

      while (size > 0) {
        const cell = stack[--size];
        const currentRow = Math.floor(cell / columns);
        const currentColumn = cell - currentRow * columns;

        if (currentRow > 0) {
          const next = cell - columns;
          if (grid[currentRow - 1][currentColumn] === 1 && visited[next] === 0) {
            visited[next] = 1;
            stack[size++] = next;
          }
        }
        if (currentRow + 1 < rows) {
          const next = cell + columns;
          if (grid[currentRow + 1][currentColumn] === 1 && visited[next] === 0) {
            visited[next] = 1;
            stack[size++] = next;
          }
        }
        if (currentColumn > 0) {
          const next = cell - 1;
          if (grid[currentRow][currentColumn - 1] === 1 && visited[next] === 0) {
            visited[next] = 1;
            stack[size++] = next;
          }
        }
        if (currentColumn + 1 < columns) {
          const next = cell + 1;
          if (grid[currentRow][currentColumn + 1] === 1 && visited[next] === 0) {
            visited[next] = 1;
            stack[size++] = next;
          }
        }
      }
    }
  }

  return islands;
}
