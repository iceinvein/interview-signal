export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const n = numCourses;
  const indeg = new Int32Array(n);
  const head = new Int32Array(n).fill(-1);
  const next = new Int32Array(prerequisites.length);
  const to = new Int32Array(prerequisites.length);
  let ec = 0;
  const seen = new Set<number>();
  for (const [a, b] of prerequisites) {
    if (a === b) return [];
    const key = b * n + a;
    if (seen.has(key)) continue;
    seen.add(key);
    to[ec] = a;
    next[ec] = head[b];
    head[b] = ec++;
    indeg[a]++;
  }

  // binary min-heap
  const heap = new Int32Array(n + 1);
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
  const res: number[] = [];
  while (size > 0) {
    const u = pop();
    res.push(u);
    for (let e = head[u]; e !== -1; e = next[e]) {
      if (--indeg[to[e]] === 0) push(to[e]);
    }
  }
  return res.length === n ? res : [];
}
