export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  const dependents: number[][] = Array.from({ length: numCourses }, () => []);
  const remainingPrerequisites = new Array<number>(numCourses).fill(0);

  for (const [course, prerequisite] of prerequisites) {
    dependents[prerequisite].push(course);
    remainingPrerequisites[course]++;
  }

  const ready: number[] = [];
  for (let course = 0; course < numCourses; course++) {
    if (remainingPrerequisites[course] === 0) ready.push(course);
  }

  let taken = 0;
  for (let head = 0; head < ready.length; head++) {
    const prerequisite = ready[head];
    taken++;

    for (const course of dependents[prerequisite]) {
      remainingPrerequisites[course]--;
      if (remainingPrerequisites[course] === 0) ready.push(course);
    }
  }

  return taken === numCourses;
}
