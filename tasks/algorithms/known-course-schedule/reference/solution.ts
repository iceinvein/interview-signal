export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  // Kahn's algorithm: a queue instead of recursion, because a chain can be numCourses long.
  const unmet = new Int32Array(numCourses);
  const unlocks: number[][] = Array.from({ length: numCourses }, () => []);
  for (const [course, before] of prerequisites) {
    unlocks[before].push(course);
    unmet[course]++;
  }
  const ready: number[] = [];
  for (let course = 0; course < numCourses; course++) {
    if (unmet[course] === 0) ready.push(course);
  }
  let taken = 0;
  for (let next = 0; next < ready.length; next++) {
    taken++;
    for (const course of unlocks[ready[next]]) {
      unmet[course]--;
      if (unmet[course] === 0) ready.push(course);
    }
  }
  return taken === numCourses;
}
