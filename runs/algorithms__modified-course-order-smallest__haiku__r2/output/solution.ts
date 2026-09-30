export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
  const adj: number[][] = Array.from({ length: numCourses }, () => []);
  const inDegree: number[] = Array(numCourses).fill(0);

  for (const [a, b] of prerequisites) {
    adj[b].push(a);
    inDegree[a]++;
  }

  const result: number[] = [];

  for (let i = 0; i < numCourses; i++) {
    let current = -1;
    for (let j = 0; j < numCourses; j++) {
      if (inDegree[j] === 0) {
        current = j;
        break;
      }
    }

    if (current === -1) {
      return [];
    }

    inDegree[current] = -1;
    result.push(current);

    for (const next of adj[current]) {
      inDegree[next]--;
    }
  }

  return result;
}
