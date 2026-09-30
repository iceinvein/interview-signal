export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  // Build adjacency list and calculate in-degrees
  const graph: number[][] = Array.from({ length: numCourses }, () => []);
  const inDegree: number[] = Array(numCourses).fill(0);

  for (const [a, b] of prerequisites) {
    graph[b].push(a);
    inDegree[a]++;
  }

  // Find all nodes with in-degree 0 (no prerequisites)
  const queue: number[] = [];
  for (let i = 0; i < numCourses; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  let processed = 0;

  // Process courses with no remaining prerequisites
  while (queue.length > 0) {
    const course = queue.shift()!;
    processed++;

    // For each course that depends on this one
    for (const dependent of graph[course]) {
      inDegree[dependent]--;
      if (inDegree[dependent] === 0) {
        queue.push(dependent);
      }
    }
  }

  // If we processed all courses, there's no cycle
  return processed === numCourses;
}
