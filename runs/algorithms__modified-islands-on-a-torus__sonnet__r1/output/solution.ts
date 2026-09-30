export function countIslandsTorus(grid: number[][]): number {
  const R = grid.length;
  const C = grid[0].length;
  const seen = new Uint8Array(R * C);
  const stack = new Int32Array(R * C);
  let count = 0;

  for (let start = 0; start < R * C; start++) {
    if (seen[start] || grid[(start / C) | 0][start % C] !== 1) continue;
    count++;
    seen[start] = 1;
    let sp = 0;
    stack[sp++] = start;
    while (sp > 0) {
      const cur = stack[--sp];
      const r = (cur / C) | 0;
      const c = cur - r * C;
      const up = ((r + R - 1) % R) * C + c;
      const down = ((r + 1) % R) * C + c;
      const left = r * C + ((c + C - 1) % C);
      const right = r * C + ((c + 1) % C);
      const nbrs = [up, down, left, right];
      for (let i = 0; i < 4; i++) {
        const n = nbrs[i];
        if (!seen[n] && grid[(n / C) | 0][n % C] === 1) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
    }
  }
  return count;
}
