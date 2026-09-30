export function shortestTeleportPath(grid: string[]): number {
  const height = grid.length;
  const width = grid[0].length;
  const size = height * width;

  const cells = new Uint8Array(size);
  const firstPortal = new Int32Array(26).fill(-1);
  const secondPortal = new Int32Array(26).fill(-1);
  let start = -1;
  let exit = -1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const cell = grid[row].charCodeAt(col);
      cells[index] = cell;

      if (cell === 83) start = index; // S
      else if (cell === 69) exit = index; // E
      else if (cell >= 97 && cell <= 122) {
        const letter = cell - 97;
        if (firstPortal[letter] === -1) firstPortal[letter] = index;
        else secondPortal[letter] = index;
      }
    }
  }

  const distance = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  distance[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const index = queue[head++];
    if (index === exit) return distance[index];

    const nextDistance = distance[index] + 1;
    const row = Math.floor(index / width);
    const col = index - row * width;
    let next: number;

    if (row > 0) {
      next = index - width;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (row + 1 < height) {
      next = index + width;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (col > 0) {
      next = index - 1;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (col + 1 < width) {
      next = index + 1;
      if (cells[next] !== 35 && distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }

    const cell = cells[index];
    if (cell >= 97 && cell <= 122) {
      const letter = cell - 97;
      next = firstPortal[letter] === index
        ? secondPortal[letter]
        : firstPortal[letter];
      if (distance[next] === -1) {
        distance[next] = nextDistance;
        queue[tail++] = next;
      }
    }
  }

  return -1;
}
