export function countIslandsTorus(grid: number[][]): number {
  const rows = grid.length;
  if (rows === 0) return 0;
  const cols = grid[0].length;
  if (cols === 0) return 0;
  const n = rows * cols;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
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

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      if (row[c] !== 1) continue;
      count++;
      const id = r * cols + c;
      // Right neighbour (with wrap); skip when it is the cell itself.
      const rc = c + 1 === cols ? 0 : c + 1;
      if (rc !== c && row[rc] === 1) {
        const nid = r * cols + rc;
        if (nid < id) union(id, nid); // already counted
      }
      // Left neighbour
      const lc = c === 0 ? cols - 1 : c - 1;
      if (lc !== c && row[lc] === 1) {
        const nid = r * cols + lc;
        if (nid < id) union(id, nid);
      }
      // Up neighbour
      const ur = r === 0 ? rows - 1 : r - 1;
      if (ur !== r && grid[ur][c] === 1) {
        const nid = ur * cols + c;
        if (nid < id) union(id, nid);
      }
      // Down neighbour
      const dr = r + 1 === rows ? 0 : r + 1;
      if (dr !== r && grid[dr][c] === 1) {
        const nid = dr * cols + c;
        if (nid < id) union(id, nid);
      }
    }
  }
  return count;
}
