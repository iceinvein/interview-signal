export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const graph: number[][] = Array.from({ length: numCourses }, () => []);
  const inDegree: number[] = Array(numCourses).fill(0);

  // Build graph: [a, b] means b must come before a
  for (const [a, b] of prerequisites) {
    if (a === b) {
      // Self-loop, impossible to satisfy
      return [];
    }
    graph[b].push(a);
    inDegree[a]++;
  }

  // Min-heap to process courses in lexicographically smallest order
  class MinHeap {
    private heap: number[] = [];

    push(val: number) {
      this.heap.push(val);
      this.bubbleUp(this.heap.length - 1);
    }

    pop(): number {
      if (this.heap.length === 0) return -1;
      const min = this.heap[0];
      const last = this.heap.pop()!;
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.bubbleDown(0);
      }
      return min;
    }

    private bubbleUp(i: number) {
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (this.heap[parent] <= this.heap[i]) break;
        [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
        i = parent;
      }
    }

    private bubbleDown(i: number) {
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
        if (smallest === i) break;

        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }

    isEmpty(): boolean {
      return this.heap.length === 0;
    }
  }

  const heap = new MinHeap();

  // Add all courses with no prerequisites
  for (let i = 0; i < numCourses; i++) {
    if (inDegree[i] === 0) {
      heap.push(i);
    }
  }

  const result: number[] = [];

  // Process courses in order of smallest number first
  while (!heap.isEmpty()) {
    const current = heap.pop();
    result.push(current);

    // Reduce in-degree of dependent courses
    for (const dependent of graph[current]) {
      inDegree[dependent]--;
      if (inDegree[dependent] === 0) {
        heap.push(dependent);
      }
    }
  }

  // Return result only if all courses were processed (no cycle)
  return result.length === numCourses ? result : [];
}
