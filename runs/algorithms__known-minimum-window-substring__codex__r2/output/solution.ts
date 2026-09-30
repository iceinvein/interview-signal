export function minWindow(s: string, t: string): string {
  if (t.length > s.length) return "";

  const needed = new Int32Array(128);
  for (let i = 0; i < t.length; i++) {
    needed[t.charCodeAt(i)]++;
  }

  let missing = t.length;
  let left = 0;
  let bestStart = 0;
  let bestLength = Infinity;

  for (let right = 0; right < s.length; right++) {
    const rightChar = s.charCodeAt(right);
    if (needed[rightChar] > 0) missing--;
    needed[rightChar]--;

    while (missing === 0) {
      const length = right - left + 1;
      if (length < bestLength) {
        bestLength = length;
        bestStart = left;
      }

      const leftChar = s.charCodeAt(left++);
      needed[leftChar]++;
      if (needed[leftChar] > 0) missing++;
    }
  }

  return bestLength === Infinity ? "" : s.slice(bestStart, bestStart + bestLength);
}
