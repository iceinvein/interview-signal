export function shortestTeleportPath(grid: string[]): number {
  const h = grid.length;
  const w = grid[0].length;
  const n = h * w;
  const twin = new Int32Array(n).fill(-1);
  const first = new Int32Array(26).fill(-1);
  let s = -1;
  let e = -1;
  for (let r = 0; r < h; r++) {
    const row = grid[r];
    for (let c = 0; c < w; c++) {
      const ch = row.charCodeAt(c);
      const i = r * w + c;
      if (ch === 83) s = i;
      else if (ch === 69) e = i;
      else if (ch >= 97 && ch <= 122) {
        const k = ch - 97;
        if (first[k] < 0) first[k] = i;
        else {
          twin[i] = first[k];
          twin[first[k]] = i;
        }
      }
    }
  }
  if (s < 0 || e < 0) return -1;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = s;
  dist[s] = 0;
  const visit = (j: number, d: number) => {
    if (dist[j] >= 0) return;
    dist[j] = d;
    queue[tail++] = j;
  };
  while (head < tail) {
    const i = queue[head++];
    if (i === e) return dist[i];
    const d = dist[i] + 1;
    const r = (i / w) | 0;
    const c = i - r * w;
    if (r > 0 && grid[r - 1][c] !== "#") visit(i - w, d);
    if (r < h - 1 && grid[r + 1][c] !== "#") visit(i + w, d);
    if (c > 0 && grid[r][c - 1] !== "#") visit(i - 1, d);
    if (c < w - 1 && grid[r][c + 1] !== "#") visit(i + 1, d);
    if (twin[i] >= 0) visit(twin[i], d);
  }
  return -1;
}
