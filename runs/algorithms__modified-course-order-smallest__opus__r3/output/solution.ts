export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const n = numCourses;
  const m = prerequisites.length;

  // Build CSR adjacency: edge b -> a. Duplicate edges are harmless for Kahn's
  // algorithm since each copy both increments and later decrements indegree.
  const indeg = new Int32Array(n);
  const start = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) {
    const [a, b] = prerequisites[i];
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

  // Binary min-heap of available courses.
  const heap = new Int32Array(n);
  let size = 0;
  const push = (v: number): void => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= v) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = v;
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap[--size];
    let i = 0;
    while (true) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && heap[c + 1] < heap[c]) c++;
      if (heap[c] >= last) break;
      heap[i] = heap[c];
      i = c;
    }
    heap[i] = last;
    return top;
  };

  for (let i = 0; i < n; i++) if (indeg[i] === 0) push(i);

  const order: number[] = [];
  while (size > 0) {
    const u = pop();
    order.push(u);
    for (let e = start[u]; e < start[u + 1]; e++) {
      const v = adj[e];
      if (--indeg[v] === 0) push(v);
    }
  }

  return order.length === n ? order : [];
}
