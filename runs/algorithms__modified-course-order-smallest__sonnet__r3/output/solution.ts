export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const n = numCourses;
  const indeg = new Int32Array(n);
  const head = new Int32Array(n).fill(-1);
  const next = new Int32Array(prerequisites.length);
  const to = new Int32Array(prerequisites.length);
  const seen = new Set<number>();
  let m = 0;
  for (const [a, b] of prerequisites) {
    if (a === b) return [];
    const key = b * n + a;
    if (seen.has(key)) continue;
    seen.add(key);
    to[m] = a;
    next[m] = head[b];
    head[b] = m++;
    indeg[a]++;
  }

  // binary min-heap
  const heap: number[] = [];
  const push = (v: number) => {
    let i = heap.length;
    heap.push(v);
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
    const last = heap.pop()!;
    const len = heap.length;
    if (len > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && heap[c + 1] < heap[c]) c++;
        if (heap[c] >= last) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return top;
  };

  for (let i = 0; i < n; i++) if (indeg[i] === 0) push(i);
  const result: number[] = [];
  while (heap.length > 0) {
    const u = pop();
    result.push(u);
    for (let e = head[u]; e !== -1; e = next[e]) {
      if (--indeg[to[e]] === 0) push(to[e]);
    }
  }
  return result.length === n ? result : [];
}
