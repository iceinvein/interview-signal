export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  const columns = grid[0].length;
  const cellCount = rows * columns;
  const visited = new Uint8Array(cellCount);
  const stack = new Int32Array(cellCount);
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const start = row * columns + column;
      if (grid[row][column] === 0 || visited[start]) continue;

      islands++;
      let size = 0;
      stack[size++] = start;
      visited[start] = 1;

      while (size > 0) {
        const cell = stack[--size];
        const currentRow = Math.floor(cell / columns);
        const currentColumn = cell - currentRow * columns;
        const up = currentRow === 0 ? rows - 1 : currentRow - 1;
        const down = currentRow === rows - 1 ? 0 : currentRow + 1;
        const left = currentColumn === 0 ? columns - 1 : currentColumn - 1;
        const right = currentColumn === columns - 1 ? 0 : currentColumn + 1;

        let neighbor = up * columns + currentColumn;
        if (grid[up][currentColumn] === 1 && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack[size++] = neighbor;
        }

        neighbor = down * columns + currentColumn;
        if (grid[down][currentColumn] === 1 && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack[size++] = neighbor;
        }

        neighbor = currentRow * columns + left;
        if (grid[currentRow][left] === 1 && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack[size++] = neighbor;
        }

        neighbor = currentRow * columns + right;
        if (grid[currentRow][right] === 1 && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack[size++] = neighbor;
        }
      }
    }
  }

  return islands;
}
