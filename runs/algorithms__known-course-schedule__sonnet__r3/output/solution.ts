export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const n = numCourses;
  const m = prerequisites.length;
  const indeg = new Int32Array(n);
  const start = new Int32Array(n + 1);

  for (let i = 0; i < m; i++) {
    start[prerequisites[i][1] + 1]++;
    indeg[prerequisites[i][0]]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];

  const pos = start.slice(0, n);
  const adj = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    adj[pos[prerequisites[i][1]]++] = prerequisites[i][0];
  }

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;

  while (head < tail) {
    const u = queue[head++];
    for (let e = start[u]; e < start[u + 1]; e++) {
      const v = adj[e];
      if (--indeg[v] === 0) queue[tail++] = v;
    }
  }
  return tail === n;
}
