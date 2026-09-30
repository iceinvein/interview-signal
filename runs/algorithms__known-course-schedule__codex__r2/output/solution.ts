export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const dependents: number[][] = Array.from({ length: numCourses }, () => []);
  const indegree = new Int32Array(numCourses);

  for (const [course, prerequisite] of prerequisites) {
    if (course === prerequisite) return false;
    dependents[prerequisite].push(course);
    indegree[course]++;
  }

  const queue: number[] = [];
  for (let course = 0; course < numCourses; course++) {
    if (indegree[course] === 0) queue.push(course);
  }

  let taken = 0;
  for (let head = 0; head < queue.length; head++) {
    const course = queue[head];
    taken++;
    for (const dependent of dependents[course]) {
      indegree[dependent]--;
      if (indegree[dependent] === 0) queue.push(dependent);
    }
  }

  return taken === numCourses;
}
