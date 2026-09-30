export function minWindowSubsequence(s: string, t: string): string {
  const m = t.length;
  // dp[j]: latest start index of a substring ending at or before the current
  // position that contains t[0..j] as a subsequence (-1 if none).
  const dp = new Array<number>(m).fill(-1);
  let bestStart = -1;
  let bestLen = Infinity;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    for (let j = m - 1; j >= 0; j--) {
      if (c !== t[j]) continue;
      if (j === 0) dp[0] = i;
      else if (dp[j - 1] >= 0) dp[j] = dp[j - 1];
      else continue;
      if (j === m - 1) {
        const len = i - dp[j] + 1;
        if (len < bestLen) {
          bestLen = len;
          bestStart = dp[j];
        }
      }
    }
  }
  return bestStart < 0 ? "" : s.substr(bestStart, bestLen);
}
