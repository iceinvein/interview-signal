export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

  let islandCount = 0;

  function bfs(startR: number, startC: number) {
    const queue: [number, number][] = [[startR, startC]];
    visited[startR][startC] = true;

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;

      // Check all 4 neighbors with wraparound (up, down, left, right)
      const neighbors = [
        [((r - 1 + rows) % rows), c], // up
        [((r + 1) % rows), c], // down
        [r, ((c - 1 + cols) % cols)], // left
        [r, ((c + 1) % cols)] // right
      ];

      for (const [nr, nc] of neighbors) {
        // Skip if neighbor is the same cell (for single row/column grids)
        if (nr === r && nc === c) continue;

        // If not visited and is land, add to queue
        if (!visited[nr][nc] && grid[nr][nc] === 1) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
  }

  // Find all islands by starting BFS from each unvisited land cell
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
