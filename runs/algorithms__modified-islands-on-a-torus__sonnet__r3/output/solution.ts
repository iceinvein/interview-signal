export function countIslandsTorus(grid: number[][]): number {
  const R = grid.length;
  const C = R > 0 ? grid[0].length : 0;
  const n = R * C;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  let count = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (grid[r][c] === 1) count++;
    }
  }

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      count--;
    }
  };

  for (let r = 0; r < R; r++) {
    const row = grid[r];
    const down = grid[(r + 1) % R];
    for (let c = 0; c < C; c++) {
      if (row[c] !== 1) continue;
      const i = r * C + c;
      const nc = (c + 1) % C;
      if (row[nc] === 1) union(i, r * C + nc);
      const nr = (r + 1) % R;
      if (down[c] === 1) union(i, nr * C + c);
    }
  }
  return count;
}
