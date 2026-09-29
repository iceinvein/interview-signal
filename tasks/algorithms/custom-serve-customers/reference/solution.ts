export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const n = arrivals.length;
  // Servers are interchangeable, so only their free times matter; servers
  // beyond the customer count can never be reached.
  const size = Math.min(servers, n);
  const freeAt = new Float64Array(size);
  const finish = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const end = Math.max(arrivals[i], freeAt[0]) + durations[i];
    finish[i] = end;
    replaceMin(freeAt, end);
  }
  return finish;
}

function replaceMin(heap: Float64Array, value: number): void {
  const size = heap.length;
  let i = 0;
  while (true) {
    const left = 2 * i + 1;
    if (left >= size) break;
    const right = left + 1;
    const child = right < size && heap[right] < heap[left] ? right : left;
    if (heap[child] >= value) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = value;
}
