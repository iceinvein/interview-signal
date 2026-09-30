export function shortestTeleportPath(grid: string[]): number {
  const height = grid.length;
  const width = grid[0].length;
  const size = height * width;

  const cells = new Uint8Array(size);
  const twins = new Int32Array(size);
  twins.fill(-1);
  const firstPortal = new Int32Array(26);
  firstPortal.fill(-1);

  let start = -1;
  let end = -1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const cell = grid[row].charCodeAt(col);
      cells[index] = cell;

      if (cell === 83) { // S
        start = index;
      } else if (cell === 69) { // E
        end = index;
      } else if (cell >= 97 && cell <= 122) { // a-z
        const letter = cell - 97;
        const first = firstPortal[letter];
        if (first === -1) {
          firstPortal[letter] = index;
        } else {
          twins[first] = index;
          twins[index] = first;
        }
      }
    }
  }

  const distance = new Int32Array(size);
  distance.fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  distance[start] = 0;

  while (head < tail) {
    const current = queue[head++];
    if (current === end) return distance[current];

    const nextDistance = distance[current] + 1;
    const col = current % width;
    let next: number;

    if (current >= width) {
      next = current - width;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (current + width < size) {
      next = current + width;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (col > 0) {
      next = current - 1;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (col + 1 < width) {
      next = current + 1;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }

    next = twins[current];
    if (next !== -1 && distance[next] === -1) {
      distance[next] = nextDistance;
      queue[tail++] = next;
    }
  }

  return -1;
}
