export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const count = arrivals.length;
  const finishes = new Array<number>(count);
  if (count === 0) return finishes;

  // The heap stores when each server next becomes free. Only as many
  // servers as customers are needed; every unused server stays free at 0.
  const heap = new Array<number>(Math.min(servers, count)).fill(0);
  const heapSize = heap.length;

  for (let i = 0; i < count; i++) {
    const start = Math.max(arrivals[i], heap[0]);
    const finish = start + durations[i];
    finishes[i] = finish;

    // Replacing the minimum with its new free time can only move it down.
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= heapSize) break;

      const right = left + 1;
      let child = left;
      if (right < heapSize && heap[right] < heap[left]) child = right;
      if (heap[child] >= finish) break;

      heap[parent] = heap[child];
      parent = child;
    }
    heap[parent] = finish;
  }

  return finishes;
}
