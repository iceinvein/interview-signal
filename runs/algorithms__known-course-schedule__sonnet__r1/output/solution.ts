export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const n = numCourses;
  const indeg = new Int32Array(n);
  const start = new Int32Array(n + 1);
  for (const [a, b] of prerequisites) {
    start[b + 1]++;
    indeg[a]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const adj = new Int32Array(prerequisites.length);
  for (const [a, b] of prerequisites) adj[fill[b]++] = a;

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const u = queue[head++];
    for (let k = start[u]; k < start[u + 1]; k++) {
      const v = adj[k];
      if (--indeg[v] === 0) queue[tail++] = v;
    }
  }
  return tail === n;
}
