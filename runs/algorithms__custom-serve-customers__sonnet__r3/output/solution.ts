export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const n = arrivals.length;
  const k = Math.min(servers, n);
  const result: number[] = new Array(n);
  if (n === 0) return result;
  // Min-heap of server free times (all zero initially, which is a valid heap).
  const heap = new Float64Array(k);

  for (let i = 0; i < n; i++) {
    const free = heap[0];
    const a = arrivals[i];
    const end = (free > a ? free : a) + durations[i];
    result[i] = end;
    // Replace the root with the new free time and sift down.
    let pos = 0;
    while (true) {
      let child = 2 * pos + 1;
      if (child >= k) break;
      if (child + 1 < k && heap[child + 1] < heap[child]) child++;
      if (heap[child] >= end) break;
      heap[pos] = heap[child];
      pos = child;
    }
    heap[pos] = end;
  }
  return result;
}
