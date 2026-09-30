export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const outgoing: number[][] = Array.from({ length: numCourses }, () => []);
  const indegree = new Int32Array(numCourses);
  const seen = new Set<number>();

  for (const [course, prerequisite] of prerequisites) {
    if (course === prerequisite) return [];

    const edge = prerequisite * numCourses + course;
    if (seen.has(edge)) continue;
    seen.add(edge);

    outgoing[prerequisite].push(course);
    indegree[course]++;
  }

  const heap: number[] = [];

  function push(value: number): void {
    let index = heap.length;
    heap.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent] <= value) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = value;
  }

  function pop(): number {
    const smallest = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      while (2 * index + 1 < heap.length) {
        let child = 2 * index + 1;
        if (child + 1 < heap.length && heap[child + 1] < heap[child]) child++;
        if (heap[child] >= last) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return smallest;
  }

  for (let course = 0; course < numCourses; course++) {
    if (indegree[course] === 0) push(course);
  }

  const order: number[] = [];
  while (heap.length > 0) {
    const course = pop();
    order.push(course);
    for (const next of outgoing[course]) {
      if (--indegree[next] === 0) push(next);
    }
  }

  return order.length === numCourses ? order : [];
}
