export function shortestTeleportPath(grid: string[]): number {
  if (!grid || grid.length === 0) return -1;

  const rows = grid.length;
  const cols = grid[0].length;

  // Find start, end, and portal positions
  let start: [number, number] = [0, 0];
  let end: [number, number] = [0, 0];
  const portals = new Map<string, [number, number][]>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell === 'S') {
        start = [r, c];
      } else if (cell === 'E') {
        end = [r, c];
      } else if (cell >= 'a' && cell <= 'z') {
        if (!portals.has(cell)) {
          portals.set(cell, []);
        }
        portals.get(cell)!.push([r, c]);
      }
    }
  }

  // BFS
  const queue: Array<[number, number, number]> = [[start[0], start[1], 0]];
  const visited = new Set<string>();
  visited.add(`${start[0]},${start[1]}`);

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c, dist] = queue.shift()!;

    if (r === end[0] && c === end[1]) {
      return dist;
    }

    // Try all 4 directions
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;

      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== '#') {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc, dist + 1]);
        }
      }
    }

    // Try portal jump
    const cell = grid[r][c];
    if (cell >= 'a' && cell <= 'z') {
      const positions = portals.get(cell);
      if (positions && positions.length === 2) {
        // Find the other portal
        const other = positions[0][0] === r && positions[0][1] === c ? positions[1] : positions[0];
        const key = `${other[0]},${other[1]}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([other[0], other[1], dist + 1]);
        }
      }
    }
  }

  return -1;
}
