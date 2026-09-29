const WALL = "#".charCodeAt(0);
const START = "S".charCodeAt(0);
const EXIT = "E".charCodeAt(0);
const LOWER_A = "a".charCodeAt(0);
const LOWER_Z = "z".charCodeAt(0);

export function shortestTeleportPath(grid: string[]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const total = rows * cols;
  const codes = new Uint8Array(total);
  // Twin of each portal cell, found in one pass by remembering each letter's first cell.
  const twin = new Int32Array(total).fill(-1);
  const firstOfLetter = new Int32Array(26).fill(-1);
  let start = -1;
  let exit = -1;
  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const cell = r * cols + c;
      const code = row.charCodeAt(c);
      codes[cell] = code;
      if (code === START) start = cell;
      else if (code === EXIT) exit = cell;
      else if (code >= LOWER_A && code <= LOWER_Z) {
        const letter = code - LOWER_A;
        const other = firstOfLetter[letter];
        if (other === -1) firstOfLetter[letter] = cell;
        else {
          twin[cell] = other;
          twin[other] = cell;
        }
      }
    }
  }

  const dist = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  const visit = (next: number, d: number) => {
    if (dist[next] !== -1 || codes[next] === WALL) return;
    dist[next] = d;
    queue[tail++] = next;
  };
  while (head < tail) {
    const cell = queue[head++];
    if (cell === exit) return dist[cell];
    const d = dist[cell] + 1;
    const r = Math.floor(cell / cols);
    const c = cell - r * cols;
    if (r > 0) visit(cell - cols, d);
    if (r < rows - 1) visit(cell + cols, d);
    if (c > 0) visit(cell - 1, d);
    if (c < cols - 1) visit(cell + 1, d);
    if (twin[cell] !== -1) visit(twin[cell], d);
  }
  return -1;
}
