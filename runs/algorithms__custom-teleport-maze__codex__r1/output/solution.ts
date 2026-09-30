export function shortestTeleportPath(grid: string[]): number {
  const height = grid.length;
  const width = grid[0].length;
  const cellCount = height * width;

  const firstPortal = new Int32Array(26);
  const secondPortal = new Int32Array(26);
  firstPortal.fill(-1);

  let start = -1;
  let exit = -1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const position = row * width + col;
      const code = grid[row].charCodeAt(col);
      if (code === 83) {
        start = position;
      } else if (code === 69) {
        exit = position;
      } else if (code >= 97 && code <= 122) {
        const letter = code - 97;
        if (firstPortal[letter] === -1) {
          firstPortal[letter] = position;
        } else {
          secondPortal[letter] = position;
        }
      }
    }
  }

  // Zero means unvisited; stored distances are offset by one.
  const distance = new Uint32Array(cellCount);
  const queue = new Int32Array(cellCount);
  let head = 0;
  let tail = 0;
  distance[start] = 1;
  queue[tail++] = start;

  const rowSteps = [-1, 0, 1, 0];
  const colSteps = [0, 1, 0, -1];

  while (head < tail) {
    const position = queue[head++];
    const currentDistance = distance[position];
    if (position === exit) return currentDistance - 1;

    const row = Math.floor(position / width);
    const col = position % width;

    for (let direction = 0; direction < 4; direction++) {
      const nextRow = row + rowSteps[direction];
      const nextCol = col + colSteps[direction];
      if (nextRow < 0 || nextRow >= height || nextCol < 0 || nextCol >= width) continue;

      const next = nextRow * width + nextCol;
      if (distance[next] !== 0 || grid[nextRow].charCodeAt(nextCol) === 35) continue;
      distance[next] = currentDistance + 1;
      queue[tail++] = next;
    }

    const code = grid[row].charCodeAt(col);
    if (code >= 97 && code <= 122) {
      const letter = code - 97;
      const twin = firstPortal[letter] === position
        ? secondPortal[letter]
        : firstPortal[letter];
      if (distance[twin] === 0) {
        distance[twin] = currentDistance + 1;
        queue[tail++] = twin;
      }
    }
  }

  return -1;
}
