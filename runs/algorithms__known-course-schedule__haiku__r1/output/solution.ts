export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  // Build adjacency list and in-degree count
  const adjList: number[][] = Array.from({ length: numCourses }, () => []);
  const inDegree: number[] = Array(numCourses).fill(0);

  for (const [a, b] of prerequisites) {
    adjList[b].push(a);
    inDegree[a]++;
  }

  // Find all courses with no prerequisites
  const queue: number[] = [];
  for (let i = 0; i < numCourses; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  let completedCourses = 0;

  while (queue.length > 0) {
    const course = queue.shift()!;
    completedCourses++;

    // Process all courses that depend on this course
    for (const nextCourse of adjList[course]) {
      inDegree[nextCourse]--;
      if (inDegree[nextCourse] === 0) {
        queue.push(nextCourse);
      }
    }
  }

  return completedCourses === numCourses;
}
