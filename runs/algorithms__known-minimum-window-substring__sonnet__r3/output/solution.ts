export function minWindow(s: string, t: string): string {
  const need = new Int32Array(128);
  for (let i = 0; i < t.length; i++) need[t.charCodeAt(i)]++;
  let missing = t.length;
  let bestLen = Infinity;
  let bestStart = 0;
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right);
    if (need[c] > 0) missing--;
    need[c]--;
    if (missing === 0) {
      // shrink from the left while the window stays valid
      while (need[s.charCodeAt(left)] < 0) {
        need[s.charCodeAt(left)]++;
        left++;
      }
      const len = right - left + 1;
      if (len < bestLen) {
        bestLen = len;
        bestStart = left;
      }
      // drop the leftmost char to look for the next window
      need[s.charCodeAt(left)]++;
      missing++;
      left++;
    }
  }
  return bestLen === Infinity ? "" : s.substring(bestStart, bestStart + bestLen);
}
