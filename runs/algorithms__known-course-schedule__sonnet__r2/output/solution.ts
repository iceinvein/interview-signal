export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const n = numCourses;
  const m = prerequisites.length;
  const indeg = new Int32Array(n);
  const start = new Int32Array(n + 1);

  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
    if (a === b) return false;
    start[b + 1]++;
    indeg[a]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];

  const fill = start.slice(0, n);
  const adj = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
    adj[fill[b]++] = a;
  }

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;

  while (head < tail) {
    const u = queue[head++];
    for (let j = start[u]; j < start[u + 1]; j++) {
      const v = adj[j];
      if (--indeg[v] === 0) queue[tail++] = v;
    }
  }
  return tail === n;
}
