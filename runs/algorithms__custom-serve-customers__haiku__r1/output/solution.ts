export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  class MinHeap {
    private heap: number[] = [];

    push(value: number): void {
      this.heap.push(value);
      this.bubbleUp(this.heap.length - 1);
    }

    pop(): number {
      const min = this.heap[0];
      const last = this.heap.pop()!;
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.bubbleDown(0);
      }
      return min;
    }

    private bubbleUp(i: number): void {
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (this.heap[i] < this.heap[parent]) {
          [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
          i = parent;
        } else {
          break;
        }
      }
    }

    private bubbleDown(i: number): void {
      while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;

        if (left < this.heap.length && this.heap[left] < this.heap[smallest]) {
          smallest = left;
        }
        if (right < this.heap.length && this.heap[right] < this.heap[smallest]) {
          smallest = right;
        }

        if (smallest !== i) {
          [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
          i = smallest;
        } else {
          break;
        }
      }
    }
  }

  const result: number[] = [];
  const heap = new MinHeap();

  for (let i = 0; i < servers; i++) {
    heap.push(0);
  }

  for (let i = 0; i < arrivals.length; i++) {
    const serverFreeTime = heap.pop();
    const startTime = Math.max(arrivals[i], serverFreeTime);
    const finishTime = startTime + durations[i];

    result.push(finishTime);
    heap.push(finishTime);
  }

  return result;
}
