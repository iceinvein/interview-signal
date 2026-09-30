export function minWindowSubsequence(s: string, t: string): string {
  const targetLength = t.length;
  if (targetLength > s.length) return "";

  // starts[j] is the latest start of a subsequence matching t[0..j].
  const starts = new Int32Array(targetLength);
  starts.fill(-1);

  let bestStart = -1;
  let bestLength = s.length + 1;

  for (let end = 0; end < s.length; end++) {
    const character = s.charCodeAt(end);

    // Work backward so a character of s cannot match twice in t.
    for (let j = targetLength - 1; j >= 0; j--) {
      if (character !== t.charCodeAt(j)) continue;
      if (j === 0) {
        starts[0] = end;
      } else if (starts[j - 1] !== -1) {
        starts[j] = starts[j - 1];
      }
    }

    if (character === t.charCodeAt(targetLength - 1)) {
      const start = starts[targetLength - 1];
      const length = end - start + 1;
      if (start !== -1 && length < bestLength) {
        bestStart = start;
        bestLength = length;
      }
    }
  }

  return bestStart === -1 ? "" : s.slice(bestStart, bestStart + bestLength);
}
