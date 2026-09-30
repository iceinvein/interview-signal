export function shortestTeleportPath(grid: string[]): number {
  const rows = grid.length;
  if (rows === 0) return -1;
  const cols = grid[0].length;
  const n = rows * cols;

  // cell codes: 0 wall, 1 open; twin[i] = twin portal index or -1
  const open = new Uint8Array(n);
  const twin = new Int32Array(n).fill(-1);
  const firstSeen = new Int32Array(26).fill(-1);
  let start = -1;
  let end = -1;

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const ch = row.charCodeAt(c);
      const i = r * cols + c;
      if (ch === 35 /* # */) continue;
      open[i] = 1;
      if (ch === 83 /* S */) start = i;
      else if (ch === 69 /* E */) end = i;
      else if (ch >= 97 && ch <= 122) {
        const k = ch - 97;
        const j = firstSeen[k];
        if (j === -1) firstSeen[k] = i;
        else {
          twin[i] = j;
          twin[j] = i;
        }
      }
    }
  }

  if (start === -1 || end === -1) return -1;
  if (start === end) return 0;

  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const cur = queue[head++];
    const d = dist[cur] + 1;
    const r = (cur / cols) | 0;
    const c = cur - r * cols;

    const visit = (nx: number): boolean => {
      if (open[nx] && dist[nx] === -1) {
        dist[nx] = d;
        if (nx === end) return true;
        queue[tail++] = nx;
      }
      return false;
    };

    if (r > 0 && visit(cur - cols)) return d;
    if (r < rows - 1 && visit(cur + cols)) return d;
    if (c > 0 && visit(cur - 1)) return d;
    if (c < cols - 1 && visit(cur + 1)) return d;
    const t = twin[cur];
    if (t !== -1 && visit(t)) return d;
  }

  return -1;
}
