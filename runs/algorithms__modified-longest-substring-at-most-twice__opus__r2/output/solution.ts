export function longestSubstringAtMostTwice(s: string): number {
  const counts = new Int32Array(128);
  let best = 0;
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right);
    counts[c]++;
    while (counts[c] > 2) {
      counts[s.charCodeAt(left)]--;
      left++;
    }
    const len = right - left + 1;
    if (len > best) best = len;
  }
  return best;
}
