export function longestBalancedRun(s: string): number {
  const n = s.length;
  // balance ranges over [-n, n]; store first index at which each balance was seen
  const first = new Int32Array(2 * n + 1).fill(-2);
  first[n] = -1;
  let bal = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 120) bal++;
    else if (c === 121) bal--;
    const f = first[bal + n];
    if (f === -2) first[bal + n] = i;
    else if (i - f > best) best = i - f;
  }
  return best;
}
