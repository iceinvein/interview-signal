export function minWindow(s: string, t: string): string {
  if (t.length > s.length) return "";
  const need = new Int32Array(128);
  for (let i = 0; i < t.length; i++) need[t.charCodeAt(i)]++;
  // Characters of t still missing from the current window, counting repeats.
  let missing = t.length;
  let bestStart = 0;
  let bestLength = Infinity;
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    if (need[s.charCodeAt(right)]-- > 0) missing--;
    while (missing === 0) {
      // Strict < keeps the earliest start among equal lengths.
      if (right - left + 1 < bestLength) {
        bestLength = right - left + 1;
        bestStart = left;
      }
      if (++need[s.charCodeAt(left)] > 0) missing++;
      left++;
    }
  }
  return bestLength === Infinity ? "" : s.slice(bestStart, bestStart + bestLength);
}
