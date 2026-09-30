export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const n = arrivals.length;
  const k = Math.min(servers, n);
  const out: number[] = new Array(n);
  if (n === 0) return out;
  // Only min(servers, n) servers can ever be used; all start free at 0.
  const heap = new Float64Array(k);
  const sift = (i: number): void => {
    const v = heap[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= k) break;
      if (c + 1 < k && heap[c + 1] < heap[c]) c++;
      if (heap[c] >= v) break;
      heap[i] = heap[c];
      i = c;
    }
    heap[i] = v;
  };
  for (let i = 0; i < n; i++) {
    const free = heap[0];
    const start = arrivals[i] > free ? arrivals[i] : free;
    const end = start + durations[i];
    out[i] = end;
    heap[0] = end;
    sift(0);
  }
  return out;
}
