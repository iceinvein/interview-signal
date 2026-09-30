export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const indegree = new Int32Array(numCourses);
  const head = new Int32Array(numCourses);
  head.fill(-1);

  const next = new Int32Array(prerequisites.length);
  const destination = new Int32Array(prerequisites.length);
  const seen = new Set<number>();
  let edgeCount = 0;

  for (const [course, prerequisite] of prerequisites) {
    if (course === prerequisite) return [];

    // The largest key is below 10^10, so every key is an exact JS integer.
    const key = prerequisite * numCourses + course;
    if (seen.has(key)) continue;
    seen.add(key);

    indegree[course]++;
    destination[edgeCount] = course;
    next[edgeCount] = head[prerequisite];
    head[prerequisite] = edgeCount++;
  }

  const heap: number[] = [];
  for (let course = 0; course < numCourses; course++) {
    if (indegree[course] === 0) heap.push(course);
  }
  // The initial courses were visited in ascending order, so heap is valid.

  const order: number[] = [];
  while (heap.length > 0) {
    const course = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && heap[right] < heap[left] ? right : left;
        if (last <= heap[child]) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }

    order.push(course);
    for (let edge = head[course]; edge !== -1; edge = next[edge]) {
      const dependent = destination[edge];
      if (--indegree[dependent] !== 0) continue;

      let index = heap.length;
      heap.push(dependent);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent] <= dependent) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = dependent;
    }
  }

  return order.length === numCourses ? order : [];
}
