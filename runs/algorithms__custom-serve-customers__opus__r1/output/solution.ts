export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const n = arrivals.length;
  const result: number[] = new Array(n);
  if (n === 0) return result;

  // Min-heap of server free times. Only min(servers, n) servers can ever be used.
  const size = Math.min(servers, n);
  const heap = new Float64Array(size); // all zeros: already a valid heap

  for (let i = 0; i < n; i++) {
    const start = Math.max(arrivals[i], heap[0]);
    const end = start + durations[i];
    result[i] = end;

    // Replace root with the new free time and sift down.
    let pos = 0;
    while (true) {
      const left = 2 * pos + 1;
      if (left >= size) break;
      const right = left + 1;
      let child = left;
      if (right < size && heap[right] < heap[left]) child = right;
      if (heap[child] >= end) break;
      heap[pos] = heap[child];
      pos = child;
    }
    heap[pos] = end;
  }

  return result;
}
