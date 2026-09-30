export function minWindowSubsequence(s: string, t: string): string {
  const starts = new Int32Array(t.length);
  starts.fill(-1);

  let bestStart = -1;
  let bestLength = Infinity;

  for (let i = 0; i < s.length; i++) {
    // Work backward so each match uses a prefix found before s[i].
    for (let j = t.length - 1; j >= 0; j--) {
      if (s[i] !== t[j]) continue;

      if (j === 0) {
        starts[0] = i;
      } else if (starts[j - 1] !== -1) {
        starts[j] = starts[j - 1];
      }

      if (j === t.length - 1 && starts[j] !== -1) {
        const length = i - starts[j] + 1;
        if (length < bestLength) {
          bestLength = length;
          bestStart = starts[j];
        }
      }
    }
  }

  return bestStart === -1 ? "" : s.slice(bestStart, bestStart + bestLength);
}
