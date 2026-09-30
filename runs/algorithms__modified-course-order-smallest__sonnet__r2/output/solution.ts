export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const n = numCourses;
  // Dedupe edges b -> a using numeric keys.
  const seen = new Set<number>();
  const from: number[] = [];
  const to: number[] = [];
  for (const [a, b] of prerequisites) {
    if (a === b) return [];
    const key = b * n + a;
    if (seen.has(key)) continue;
    seen.add(key);
    from.push(b);
    to.push(a);
  }

  // CSR adjacency.
  const start = new Int32Array(n + 1);
  const indeg = new Int32Array(n);
  for (let i = 0; i < from.length; i++) {
    start[from[i] + 1]++;
    indeg[to[i]]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const pos = start.slice(0, n);
  const adj = new Int32Array(from.length);
  for (let i = 0; i < from.length; i++) adj[pos[from[i]]++] = to[i];

  // Min-heap.
  const heap = new Int32Array(n);
  let size = 0;
  const push = (v: number) => {
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
    const v = heap[--size];
    let i = 0;
    while (true) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && heap[c + 1] < heap[c]) c++;
      if (heap[c] >= v) break;
      heap[i] = heap[c];
      i = c;
    }
    heap[i] = v;
    return top;
  };

  for (let i = 0; i < n; i++) if (indeg[i] === 0) push(i);
  const order: number[] = [];
  while (size > 0) {
    const u = pop();
    order.push(u);
    for (let j = start[u]; j < start[u + 1]; j++) {
      if (--indeg[adj[j]] === 0) push(adj[j]);
    }
  }
  return order.length === n ? order : [];
}
