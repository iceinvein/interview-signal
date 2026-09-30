export function countIslandsTorus(grid: number[][]): number {
  const R = grid.length;
  if (R === 0) return 0;
  const C = grid[0].length;
  const parent = new Int32Array(R * C);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  let count = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) if (grid[r][c] === 1) count++;
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
    for (let c = 0; c < C; c++) {
      if (grid[r][c] !== 1) continue;
      const i = r * C + c;
      const right = r * C + ((c + 1) % C);
      const down = ((r + 1) % R) * C + c;
      if (grid[r][(c + 1) % C] === 1) union(i, right);
      if (grid[(r + 1) % R][c] === 1) union(i, down);
    }
  }
  return count;
}
