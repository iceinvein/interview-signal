export function longestBalancedRun(s: string): number {
  const n = s.length;
  const firstSeen = new Int32Array(2 * n + 1);
  firstSeen.fill(-1);

  let balance = 0;
  let longest = 0;
  firstSeen[n] = 0;

  for (let i = 0; i < n; i++) {
    const code = s.charCodeAt(i);
    if (code === 120) balance++; // 'x'
    else if (code === 121) balance--; // 'y'

    const slot = balance + n;
    const first = firstSeen[slot];
    if (first === -1) {
      firstSeen[slot] = i + 1;
    } else {
      const length = i + 1 - first;
      if (length > longest) longest = length;
    }
  }

  return longest;
}
