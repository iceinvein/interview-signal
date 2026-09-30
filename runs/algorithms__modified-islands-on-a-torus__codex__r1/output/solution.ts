export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const size = rows * cols;
  const visited = new Uint8Array(size);
  const stack = new Int32Array(size);
  let islands = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const start = row * cols + col;
      if (grid[row][col] === 0 || visited[start]) continue;

      islands++;
      visited[start] = 1;
      let top = 0;
      stack[top++] = start;

      while (top > 0) {
        const cell = stack[--top];
        const r = Math.floor(cell / cols);
        const c = cell - r * cols;
        const up = r === 0 ? rows - 1 : r - 1;
        const down = r === rows - 1 ? 0 : r + 1;
        const left = c === 0 ? cols - 1 : c - 1;
        const right = c === cols - 1 ? 0 : c + 1;

        const upCell = up * cols + c;
        if (grid[up][c] === 1 && !visited[upCell]) {
          visited[upCell] = 1;
          stack[top++] = upCell;
        }

        const downCell = down * cols + c;
        if (grid[down][c] === 1 && !visited[downCell]) {
          visited[downCell] = 1;
          stack[top++] = downCell;
        }

        const leftCell = r * cols + left;
        if (grid[r][left] === 1 && !visited[leftCell]) {
          visited[leftCell] = 1;
          stack[top++] = leftCell;
        }

        const rightCell = r * cols + right;
        if (grid[r][right] === 1 && !visited[rightCell]) {
          visited[rightCell] = 1;
          stack[top++] = rightCell;
        }
      }
    }
  }

  return islands;
}
