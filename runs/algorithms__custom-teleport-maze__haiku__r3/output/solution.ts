export function shortestTeleportPath(grid: string[]): number {
  const rows = grid.length;
  const cols = grid[0].length;

  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  const portals: Record<string, [number, number][]> = {};

  // Parse the grid to locate start, end, and portal twins
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = grid[i][j];
      if (cell === 'S') {
        start = [i, j];
      } else if (cell === 'E') {
        end = [i, j];
      } else if (cell >= 'a' && cell <= 'z') {
        if (!portals[cell]) {
          portals[cell] = [];
        }
        portals[cell].push([i, j]);
      }
    }
  }

  if (!start || !end) return -1;

  // BFS to find shortest path
  const queue: Array<[number, number, number]> = [[start[0], start[1], 0]];
  const visited = new Set<string>();
  visited.add(`${start[0]},${start[1]}`);

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c, dist] = queue.shift()!;

    // Check if we reached the end
    if (r === end[0] && c === end[1]) {
      return dist;
    }

    // Try walking in 4 directions
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

    // Try teleporting if standing on a portal
    const cell = grid[r][c];
    if (cell >= 'a' && cell <= 'z') {
      const portalPair = portals[cell];
      if (portalPair && portalPair.length === 2) {
        // Find the twin portal (the other end)
        const other = portalPair[0][0] === r && portalPair[0][1] === c ? portalPair[1] : portalPair[0];
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
