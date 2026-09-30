export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const n = arrivals.length;
  const k = Math.min(servers, n);
  const res: number[] = new Array(n);
  if (n === 0) return res;
  // Min-heap of server free times; only min(servers, n) servers can ever be used.
  const heap = new Float64Array(k); // all zeros: valid heap
  const size = k;
  for (let i = 0; i < n; i++) {
    const top = heap[0];
    const start = arrivals[i] > top ? arrivals[i] : top;
    const end = start + durations[i];
    res[i] = end;
    // replace root with end and sift down
    let pos = 0;
    for (;;) {
      let c = 2 * pos + 1;
      if (c >= size) break;
      if (c + 1 < size && heap[c + 1] < heap[c]) c++;
      if (heap[c] < end) {
        heap[pos] = heap[c];
        pos = c;
      } else break;
    }
    heap[pos] = end;
  }
  return res;
}
