export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  const columns = grid[0].length;
  const visited = new Uint8Array(rows * columns);
  const queue = new Int32Array(rows * columns);
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const start = row * columns + column;
      if (grid[row][column] === 0 || visited[start] !== 0) continue;

      islands++;
      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;

      while (head < tail) {
        const cell = queue[head++];
        const currentRow = Math.floor(cell / columns);
        const currentColumn = cell % columns;
        const above = (currentRow + rows - 1) % rows;
        const below = (currentRow + 1) % rows;
        const left = (currentColumn + columns - 1) % columns;
        const right = (currentColumn + 1) % columns;

        let neighbor = above * columns + currentColumn;
        if (grid[above][currentColumn] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }

        neighbor = below * columns + currentColumn;
        if (grid[below][currentColumn] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }

        neighbor = currentRow * columns + left;
        if (grid[currentRow][left] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }

        neighbor = currentRow * columns + right;
        if (grid[currentRow][right] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
  }

  return islands;
}
