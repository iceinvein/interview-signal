export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  if (rows === 0) return 0;
  const cols = grid[0].length;
  const parent = new Int32Array(rows * cols);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  let count = 0;
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      count--;
    }
  };

  // Every edge of the torus is some cell's right or down edge, so checking
  // those two (with wrap) covers all adjacencies. Self-edges are skipped.
  for (const row of grid) {
    for (let c = 0; c < cols; c++) if (row[c] === 1) count++;
  }
  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    const dr = r + 1 === rows ? 0 : r + 1;
    const down = grid[dr];
    for (let c = 0; c < cols; c++) {
      if (row[c] !== 1) continue;
      const id = r * cols + c;
      const rc = c + 1 === cols ? 0 : c + 1;
      if (rc !== c && row[rc] === 1) union(id, r * cols + rc);
      if (dr !== r && down[c] === 1) union(id, dr * cols + c);
    }
  }
  return count;
}
