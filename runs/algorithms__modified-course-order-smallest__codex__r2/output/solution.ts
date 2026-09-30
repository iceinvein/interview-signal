export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const outgoing: number[][] = Array.from({ length: numCourses }, () => []);
  const indegree = new Int32Array(numCourses);

  for (const [course, prerequisite] of prerequisites) {
    outgoing[prerequisite].push(course);
    indegree[course]++;
  }

  const heap: number[] = [];

  function push(course: number): void {
    let index = heap.length;
    heap.push(course);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent] <= course) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = course;
  }

  function pop(): number {
    const smallest = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && heap[right] < heap[left] ? right : left;
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
      indegree[next]--;
      if (indegree[next] === 0) push(next);
    }
  }

  return order.length === numCourses ? order : [];
}
