export function minWindowSubsequence(s: string, t: string): string {
  const n = s.length;
  const m = t.length;
  // startOf[i] is the latest start of a window ending at i that contains the
  // first j + 1 characters of t as a subsequence, or -1 if none; the latest
  // start gives the shortest window for that end.
  let startOf = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) === t.charCodeAt(0)) startOf[i] = i;
  }
  for (let j = 1; j < m; j++) {
    const next = new Int32Array(n).fill(-1);
    const target = t.charCodeAt(j);
    let latest = -1;
    for (let i = 0; i < n; i++) {
      if (latest !== -1 && s.charCodeAt(i) === target) next[i] = latest;
      if (startOf[i] !== -1) latest = startOf[i];
    }
    startOf = next;
  }
  let bestStart = -1;
  let bestLength = Infinity;
  for (let i = 0; i < n; i++) {
    // Ends are visited left to right, so strict < keeps the earliest start
    // among equal lengths.
    if (startOf[i] !== -1 && i - startOf[i] + 1 < bestLength) {
      bestLength = i - startOf[i] + 1;
      bestStart = startOf[i];
    }
  }
  return bestStart === -1 ? "" : s.slice(bestStart, bestStart + bestLength);
}
