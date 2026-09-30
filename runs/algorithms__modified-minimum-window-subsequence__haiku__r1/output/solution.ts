export function minWindowSubsequence(s: string, t: string): string {
  let minLength = Infinity;
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
      const length = j - i;
      if (length < minLength) {
        minLength = length;
        minStart = i;
      }
    }
  }

  return minLength === Infinity ? "" : s.substring(minStart, minStart + minLength);
}
