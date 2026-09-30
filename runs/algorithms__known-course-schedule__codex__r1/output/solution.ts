export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const dependents: number[][] = new Array(numCourses);
  const remainingPrerequisites = new Int32Array(numCourses);

  for (const [course, prerequisite] of prerequisites) {
    if (dependents[prerequisite] === undefined) {
      dependents[prerequisite] = [];
    }
    dependents[prerequisite].push(course);
    remainingPrerequisites[course]++;
  }

  const queue = new Int32Array(numCourses);
  let head = 0;
  let tail = 0;

  for (let course = 0; course < numCourses; course++) {
    if (remainingPrerequisites[course] === 0) {
      queue[tail++] = course;
    }
  }

  while (head < tail) {
    const course = queue[head++];
    const nextCourses = dependents[course];
    if (nextCourses === undefined) continue;

    for (const next of nextCourses) {
      remainingPrerequisites[next]--;
      if (remainingPrerequisites[next] === 0) {
        queue[tail++] = next;
      }
    }
  }

  return tail === numCourses;
}
