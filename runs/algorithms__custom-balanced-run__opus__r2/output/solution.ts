export function longestBalancedRun(s: string): number {
  const n = s.length;
  // first[b + n] = earliest prefix index with balance b (x count minus y count)
  const first = new Int32Array(2 * n + 1).fill(-1);
  first[n] = 0;
  let balance = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 120) balance++; // 'x'
    else if (c === 121) balance--; // 'y'
    const k = balance + n;
    const f = first[k];
    if (f === -1) first[k] = i + 1;
    else if (i + 1 - f > best) best = i + 1 - f;
  }
  return best;
}
