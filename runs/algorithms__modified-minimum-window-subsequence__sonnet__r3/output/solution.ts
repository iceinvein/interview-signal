export function minWindowSubsequence(s: string, t: string): string {
  const n = s.length;
  const m = t.length;
  // dp[j]: latest start index of a substring ending at or before the current
  // position that contains t[0..j] as a subsequence, or -1 if none.
  const dp = new Array<number>(m).fill(-1);
  let bestStart = -1;
  let bestLen = Infinity;

  for (let i = 0; i < n; i++) {
    const c = s[i];
    for (let j = m - 1; j >= 0; j--) {
      if (c !== t[j]) continue;
      if (j === 0) dp[0] = i;
      else if (dp[j - 1] >= 0) dp[j] = dp[j - 1];
    }
    if (dp[m - 1] >= 0) {
      const len = i - dp[m - 1] + 1;
      if (len < bestLen) {
        bestLen = len;
        bestStart = dp[m - 1];
      }
    }
  }

  return bestStart < 0 ? "" : s.substr(bestStart, bestLen);
}
