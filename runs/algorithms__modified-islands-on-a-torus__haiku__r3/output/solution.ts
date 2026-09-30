export function countIslandsTorus(grid: number[][]): number {
  if (!grid || grid.length === 0) return 0;

  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();

  function getNeighbors(r: number, c: number): [number, number][] {
    const neighbors: [number, number][] = [];

    // Up (wrap around at top)
    const upR = (r - 1 + rows) % rows;
    if (upR !== r) neighbors.push([upR, c]);

    // Down (wrap around at bottom)
    const downR = (r + 1) % rows;
    if (downR !== r) neighbors.push([downR, c]);

    // Left (wrap around at left edge)
    const leftC = (c - 1 + cols) % cols;
    if (leftC !== c) neighbors.push([r, leftC]);

    // Right (wrap around at right edge)
    const rightC = (c + 1) % cols;
    if (rightC !== c) neighbors.push([r, rightC]);

    return neighbors;
  }

  function dfs(r: number, c: number): void {
    const key = `${r},${c}`;
    if (visited.has(key)) return;

    visited.add(key);

    const neighbors = getNeighbors(r, c);
    for (const [nr, nc] of neighbors) {
      if (grid[nr][nc] === 1 && !visited.has(`${nr},${nc}`)) {
        dfs(nr, nc);
      }
    }
  }

  let islandCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1 && !visited.has(`${r},${c}`)) {
        dfs(r, c);
        islandCount++;
      }
    }
  }

  return islandCount;
}
