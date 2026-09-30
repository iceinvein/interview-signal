export function countIslandsTorus(grid: number[][]): number {
  if (!grid || grid.length === 0) return 0;

  const rows = grid.length;
  const cols = grid[0].length;
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  let islandCount = 0;

  function getNeighbors(r: number, c: number): [number, number][] {
    const neighbors: [number, number][] = [];

    // Up (wraps vertically, but not if single row)
    const upR = (r - 1 + rows) % rows;
    if (upR !== r) neighbors.push([upR, c]);

    // Down (wraps vertically, but not if single row)
    const downR = (r + 1) % rows;
    if (downR !== r) neighbors.push([downR, c]);

    // Left (wraps horizontally, but not if single column)
    const leftC = (c - 1 + cols) % cols;
    if (leftC !== c) neighbors.push([r, leftC]);

    // Right (wraps horizontally, but not if single column)
    const rightC = (c + 1) % cols;
    if (rightC !== c) neighbors.push([r, rightC]);

    return neighbors;
  }

  function bfs(startR: number, startC: number) {
    const queue: [number, number][] = [[startR, startC]];
    visited[startR][startC] = true;

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;

      for (const [nr, nc] of getNeighbors(r, c)) {
        if (!visited[nr][nc] && grid[nr][nc] === 1) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1 && !visited[r][c]) {
        bfs(r, c);
        islandCount++;
      }
    }
  }

  return islandCount;
}
