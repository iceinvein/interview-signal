class MinHeap {
  private data: number[] = [];

  push(item: number) {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): number {
    const result = this.data[0];
    const end = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = end!;
      this.bubbleDown(0);
    }
    return result;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[i] < this.data[parent]) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private bubbleDown(i: number) {
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      if (left < this.data.length && this.data[left] < this.data[smallest]) {
        smallest = left;
      }
      if (right < this.data.length && this.data[right] < this.data[smallest]) {
        smallest = right;
      }

      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const heap = new MinHeap();

  for (let i = 0; i < servers; i++) {
    heap.push(0);
  }

  const result: number[] = [];

  for (let i = 0; i < arrivals.length; i++) {
    const freeTime = heap.pop();
    const serviceStart = Math.max(arrivals[i], freeTime);
    const serviceEnd = serviceStart + durations[i];
    heap.push(serviceEnd);
    result.push(serviceEnd);
  }

  return result;
}
