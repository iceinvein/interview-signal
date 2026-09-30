export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[] {
  const result: number[] = [];

  // Min-heap to track when each server becomes free
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

    private bubbleUp(index: number): void {
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        if (this.heap[index] >= this.heap[parentIndex]) break;
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      }
    }

    private bubbleDown(index: number): void {
      while (true) {
        let smallest = index;
        const leftChild = 2 * index + 1;
        const rightChild = 2 * index + 2;

        if (leftChild < this.heap.length && this.heap[leftChild] < this.heap[smallest]) {
          smallest = leftChild;
        }
        if (rightChild < this.heap.length && this.heap[rightChild] < this.heap[smallest]) {
          smallest = rightChild;
        }

        if (smallest === index) break;

        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      }
    }
  }

  // Initialize heap with all servers free at time 0
  const heap = new MinHeap();
  for (let i = 0; i < servers; i++) {
    heap.push(0);
  }

  for (let i = 0; i < arrivals.length; i++) {
    // Get the server that becomes free earliest
    const serverFreeTime = heap.pop();

    // Service starts at the later of arrival and server free time
    const startTime = Math.max(arrivals[i], serverFreeTime);

    // Service ends at start + duration
    const endTime = startTime + durations[i];

    // Put the server back with its new free time
    heap.push(endTime);

    // Record finish time
    result.push(endTime);
  }

  return result;
}
