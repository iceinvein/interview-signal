export function shortestTeleportPath(grid: string[]): number {
  const rows = grid.length;
  if (rows === 0) return -1;
  const cols = grid[0].length;
  const n = rows * cols;

  const cells = new Uint8Array(n);
  const twin = new Int32Array(n).fill(-1);
  const firstPortal = new Int32Array(26).fill(-1);
  let start = -1;
  let end = -1;

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const code = row.charCodeAt(c);
      const idx = r * cols + c;
      cells[idx] = code;
      if (code === 83) start = idx; // 'S'
      else if (code === 69) end = idx; // 'E'
      else if (code >= 97 && code <= 122) {
        const p = code - 97;
        if (firstPortal[p] === -1) firstPortal[p] = idx;
        else {
          twin[idx] = firstPortal[p];
          twin[firstPortal[p]] = idx;
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

    const visit = (next: number): boolean => {
      if (dist[next] !== -1 || cells[next] === 35) return false; // '#'
      dist[next] = d;
      if (next === end) return true;
      queue[tail++] = next;
      return false;
    };

    if (r > 0 && visit(cur - cols)) return d;
    if (r < rows - 1 && visit(cur + cols)) return d;
    if (c > 0 && visit(cur - 1)) return d;
    if (c < cols - 1 && visit(cur + 1)) return d;
    if (twin[cur] !== -1 && visit(twin[cur])) return d;
  }
  return -1;
}
