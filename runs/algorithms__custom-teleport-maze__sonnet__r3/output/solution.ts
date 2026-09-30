export function shortestTeleportPath(grid: string[]): number {
  const h = grid.length;
  const w = grid[0].length;
  const n = h * w;
  const twin = new Int32Array(26).fill(-1);
  const other = new Int32Array(n).fill(-1);
  let start = -1;
  let end = -1;
  for (let r = 0; r < h; r++) {
    const row = grid[r];
    for (let c = 0; c < w; c++) {
      const code = row.charCodeAt(c);
      const i = r * w + c;
      if (code === 83) start = i;
      else if (code === 69) end = i;
      else if (code >= 97 && code <= 122) {
        const k = code - 97;
        if (twin[k] === -1) twin[k] = i;
        else {
          other[i] = twin[k];
          other[twin[k]] = i;
        }
      }
    }
  }
  if (start < 0 || end < 0) return -1;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  const visit = (j: number, d: number) => {
    if (dist[j] === -1) {
      dist[j] = d;
      queue[tail++] = j;
    }
  };
  while (head < tail) {
    const cur = queue[head++];
    if (cur === end) return dist[cur];
    const d = dist[cur] + 1;
    const r = (cur / w) | 0;
    const c = cur - r * w;
    if (r > 0 && grid[r - 1][c] !== '#') visit(cur - w, d);
    if (r < h - 1 && grid[r + 1][c] !== '#') visit(cur + w, d);
    if (c > 0 && grid[r][c - 1] !== '#') visit(cur - 1, d);
    if (c < w - 1 && grid[r][c + 1] !== '#') visit(cur + 1, d);
    if (other[cur] >= 0) visit(other[cur], d);
  }
  return dist[end];
}
