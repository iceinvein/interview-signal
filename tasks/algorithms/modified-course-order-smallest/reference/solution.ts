export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const unmet = new Int32Array(numCourses);
  const unlocks: number[][] = Array.from({ length: numCourses }, () => []);
  for (const [course, before] of prerequisites) {
    unlocks[before].push(course);
    unmet[course]++;
  }
  // Always taking the smallest available course gives the lexicographically smallest order.
  const ready = new MinHeap(numCourses);
  for (let course = 0; course < numCourses; course++) {
    if (unmet[course] === 0) ready.push(course);
  }
  const order: number[] = [];
  while (ready.size > 0) {
    const taken = ready.pop();
    order.push(taken);
    for (const course of unlocks[taken]) {
      unmet[course]--;
      if (unmet[course] === 0) ready.push(course);
    }
  }
  return order.length === numCourses ? order : [];
}

class MinHeap {
  private readonly items: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity);
  }

  push(value: number): void {
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent] <= value) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = value;
  }

  pop(): number {
    const smallest = this.items[0];
    const last = this.items[--this.size];
    let i = 0;
    while (true) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.items[child + 1] < this.items[child]) child++;
      if (this.items[child] >= last) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = last;
    return smallest;
  }
}
