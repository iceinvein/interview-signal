export function minWindow(s: string, t: string): string {
  if (t.length > s.length) return "";

  // need[c] > 0 means the window still lacks that many copies of c.
  const need = new Int32Array(128);
  for (let i = 0; i < t.length; i++) need[t.charCodeAt(i)]++;

  let missing = t.length;
  let bestStart = 0;
  let bestLen = Infinity;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    if (need[s.charCodeAt(right)]-- > 0) missing--;

    if (missing === 0) {
      // Drop surplus characters from the left until the window is minimal.
      while (need[s.charCodeAt(left)] < 0) {
        need[s.charCodeAt(left)]++;
        left++;
      }
      // Strict comparison keeps the earliest start among equal lengths,
      // since both window ends only move rightward.
      if (right - left + 1 < bestLen) {
        bestLen = right - left + 1;
        bestStart = left;
      }
      // Give up the required character at `left` to look for the next window.
      need[s.charCodeAt(left)]++;
      left++;
      missing++;
    }
  }

  return bestLen === Infinity ? "" : s.slice(bestStart, bestStart + bestLen);
}
