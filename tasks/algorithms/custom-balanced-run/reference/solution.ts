export function longestBalancedRun(s: string): number {
  const n = s.length;
  // Balance ranges over [-n, n]; offsetting by n lets a typed array stand in
  // for a map from balance to the first prefix length that reached it.
  const firstSeen = new Int32Array(2 * n + 1).fill(-1);
  let balance = 0;
  let best = 0;
  firstSeen[n] = 0;
  for (let i = 0; i < n; i++) {
    const code = s.charCodeAt(i);
    if (code === 120) balance++;
    else if (code === 121) balance--;
    const first = firstSeen[balance + n];
    if (first === -1) firstSeen[balance + n] = i + 1;
    else if (i + 1 - first > best) best = i + 1 - first;
  }
  return best;
}
