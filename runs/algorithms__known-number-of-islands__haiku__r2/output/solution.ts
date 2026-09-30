export function countIslands(grid: number[][]): number {
  if (!grid || grid.length === 0 || grid[0].length === 0) {
    return 0;
  }

  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();
  let islandCount = 0;

  function dfs(r: number, c: number) {
    const key = `${r},${c}`;
    if (r < 0 || r >= rows || c < 0 || c >= cols || visited.has(key) || grid[r][c] === 0) {
      return;
    }

    visited.add(key);

    dfs(r + 1, c);
    dfs(r - 1, c);
    dfs(r, c + 1);
    dfs(r, c - 1);
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (grid[i][j] === 1 && !visited.has(`${i},${j}`)) {
        dfs(i, j);
        islandCount++;
      }
    }
  }

  return islandCount;
}
