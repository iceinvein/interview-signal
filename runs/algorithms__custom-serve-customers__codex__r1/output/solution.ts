export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const finishes = new Array<number>(arrivals.length);
  const freeTimes = new Array<number>(servers).fill(0);

  for (let i = 0; i < arrivals.length; i++) {
    const start = Math.max(arrivals[i], freeTimes[0]);
    const finish = start + durations[i];
    finishes[i] = finish;

    // Replace the earliest free time and restore the min-heap.
    let position = 0;
    while (true) {
      const left = position * 2 + 1;
      if (left >= servers) break;

      const right = left + 1;
      const child = right < servers && freeTimes[right] < freeTimes[left]
        ? right
        : left;
      if (finish <= freeTimes[child]) break;

      freeTimes[position] = freeTimes[child];
      position = child;
    }
    freeTimes[position] = finish;
  }

  return finishes;
}
