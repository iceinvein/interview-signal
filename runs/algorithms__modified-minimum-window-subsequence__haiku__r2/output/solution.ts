export function minWindowSubsequence(s: string, t: string): string {
  let minLen = Infinity;
  let minStart = 0;

  for (let i = 0; i < s.length; i++) {
    let j = i;
    let tIdx = 0;

    while (j < s.length && tIdx < t.length) {
      if (s[j] === t[tIdx]) {
        tIdx++;
      }
      j++;
    }

    if (tIdx === t.length) {
      const len = j - i;
      if (len < minLen) {
        minLen = len;
        minStart = i;
      }
    }
  }

  return minLen === Infinity ? "" : s.substring(minStart, minStart + minLen);
}
