export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const count = arrivals.length;
  if (count === 0) return [];

  // Servers beyond the customer count can never be needed.
  const freeTimes = new Array<number>(Math.min(servers, count)).fill(0);
  const finishes = new Array<number>(count);

  for (let i = 0; i < count; i++) {
    const start = Math.max(arrivals[i], freeTimes[0]);
    const finish = start + durations[i];
    finishes[i] = finish;

    // Replacing the earliest free time with a later one only requires
    // sifting down to restore the min-heap.
    let position = 0;
    const size = freeTimes.length;
    while (true) {
      const left = position * 2 + 1;
      if (left >= size) break;

      const right = left + 1;
      const child = right < size && freeTimes[right] < freeTimes[left]
        ? right
        : left;
      if (freeTimes[child] >= finish) break;

      freeTimes[position] = freeTimes[child];
      position = child;
    }
    freeTimes[position] = finish;
  }

  return finishes;
}
