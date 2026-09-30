export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const m = prerequisites.length;
  const indegree = new Int32Array(numCourses);
  const head = new Int32Array(numCourses).fill(-1);
  const next = new Int32Array(m);
  const to = new Int32Array(m);

  // Edge b -> a. Duplicate edges are harmless: each adds to indegree and is
  // decremented once per copy. Self-loops keep indegree > 0 forever.
  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
    to[i] = a;
    next[i] = head[b];
    head[b] = i;
    indegree[a]++;
  }

  const queue = new Int32Array(numCourses);
  let qHead = 0;
  let qTail = 0;
  for (let i = 0; i < numCourses; i++) {
    if (indegree[i] === 0) queue[qTail++] = i;
  }

  while (qHead < qTail) {
    const u = queue[qHead++];
    for (let e = head[u]; e !== -1; e = next[e]) {
      const v = to[e];
      if (--indegree[v] === 0) queue[qTail++] = v;
    }
  }

  return qTail === numCourses;
}
