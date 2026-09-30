export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean {
  // Build adjacency list: if [a, b], then b -> a (b must be taken before a)
  const graph: number[][] = Array.from({ length: numCourses }, () => []);

  for (const [a, b] of prerequisites) {
    graph[b].push(a);
  }

  // State: 0 = unvisited (white), 1 = visiting (gray), 2 = visited (black)
  const state = Array(numCourses).fill(0);

  // DFS to detect cycle
  const hasCycle = (node: number): boolean => {
    if (state[node] === 1) return true; // Back edge found (cycle)
    if (state[node] === 2) return false; // Already processed

    state[node] = 1; // Mark as visiting
    for (const neighbor of graph[node]) {
      if (hasCycle(neighbor)) {
        return true;
      }
    }
    state[node] = 2; // Mark as visited
    return false;
  };

  // Check all nodes for cycles
  for (let i = 0; i < numCourses; i++) {
    if (state[i] === 0 && hasCycle(i)) {
      return false;
    }
  }

  return true;
}
