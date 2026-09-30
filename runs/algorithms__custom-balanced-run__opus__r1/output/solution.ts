export function longestBalancedRun(s: string): number {
  const n = s.length;
  // first[d + n] = earliest prefix index with balance d (-1 = unseen)
  const first = new Int32Array(2 * n + 1).fill(-1);
  let bal = n;
  first[bal] = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 120) bal++; // 'x'
    else if (c === 121) bal--; // 'y'
    const f = first[bal];
    if (f === -1) first[bal] = i + 1;
    else if (i + 1 - f > best) best = i + 1 - f;
  }
  return best;
}
