export function minWindowSubsequence(s: string, t: string): string {
  const n = s.length;
  const m = t.length;
  // dp[j]: largest start such that t[0..j] is a subsequence of s[start..i]; -1 if none.
  const dp = new Int32Array(m).fill(-1);
  let bestStart = -1;
  let bestLen = Infinity;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    for (let j = m - 1; j >= 0; j--) {
      if (c !== t.charCodeAt(j)) continue;
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
