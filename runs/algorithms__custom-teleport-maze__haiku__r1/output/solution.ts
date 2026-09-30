export function shortestTeleportPath(grid: string[]): number {
  const rows = grid.length;
  const cols = grid[0].length;

  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  const portals: Map<string, [number, number][]> = new Map();

  // Parse the grid to find start, end, and portals
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const char = grid[r][c];
      if (char === 'S') {
        start = [r, c];
      } else if (char === 'E') {
        end = [r, c];
      } else if (char >= 'a' && char <= 'z') {
        if (!portals.has(char)) {
          portals.set(char, []);
        }
        portals.get(char)!.push([r, c]);
      }
    }
  }

  // Create a map from each portal position to its twin
  const twinPortal: Map<string, [number, number]> = new Map();
  for (const positions of portals.values()) {
    if (positions.length === 2) {
      twinPortal.set(`${positions[0][0]},${positions[0][1]}`, positions[1]);
      twinPortal.set(`${positions[1][0]},${positions[1][1]}`, positions[0]);
    }
  }

  // BFS to find shortest path
  const queue: Array<[[number, number], number]> = [[start!, 0]];
  const visited: Set<string> = new Set([`${start![0]},${start![1]}`]);

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [[r, c], dist] = queue.shift()!;

    // Check if we reached the end
    if (r === end![0] && c === end![1]) {
      return dist;
    }

    // Try moving to adjacent cells
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;

      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== '#') {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([[nr, nc], dist + 1]);
        }
      }
    }

    // If on a portal, try jumping to its twin
    const portalKey = `${r},${c}`;
    if (twinPortal.has(portalKey)) {
      const [tr, tc] = twinPortal.get(portalKey)!;
      const key = `${tr},${tc}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([[tr, tc], dist + 1]);
      }
    }
  }

  return -1;
}
