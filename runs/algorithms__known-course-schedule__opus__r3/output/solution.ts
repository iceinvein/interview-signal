export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const m = prerequisites.length;
  const indeg = new Int32Array(numCourses);
  const start = new Int32Array(numCourses + 1);

  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
    if (a === b) return false;
    start[b + 1]++;
    indeg[a]++;
  }
  for (let i = 0; i < numCourses; i++) start[i + 1] += start[i];

  // CSR adjacency: edges b -> a. Duplicate edges are harmless in Kahn's
  // algorithm since each copy adds and removes one unit of indegree.
  const adj = new Int32Array(m);
  const pos = start.slice(0, numCourses);
  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
    adj[pos[b]++] = a;
  }

  const queue = new Int32Array(numCourses);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < numCourses; i++) if (indeg[i] === 0) queue[tail++] = i;

  while (head < tail) {
    const u = queue[head++];
    for (let e = start[u]; e < start[u + 1]; e++) {
      const v = adj[e];
      if (--indeg[v] === 0) queue[tail++] = v;
    }
  }

  return tail === numCourses;
}
