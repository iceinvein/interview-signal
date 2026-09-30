export function longestBalancedRun(s: string): number {
  const n = s.length;
  // first[d + n] = earliest prefix index where (#x - #y) == d; -1 if unseen
  const first = new Int32Array(2 * n + 1).fill(-1);
  first[n] = 0;
  let diff = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 120) diff++; // 'x'
    else if (c === 121) diff--; // 'y'
    const k = diff + n;
    const f = first[k];
    if (f === -1) first[k] = i + 1;
    else if (i + 1 - f > best) best = i + 1 - f;
  }
  return best;
}
