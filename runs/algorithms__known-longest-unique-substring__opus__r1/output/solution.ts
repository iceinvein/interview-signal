export function lengthOfLongestSubstring(s: string): number {
  // lastSeen[c] = index of the most recent occurrence of char code c, or -1.
  const lastSeen = new Int32Array(128).fill(-1);
  let best = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (lastSeen[c] >= start) {
      start = lastSeen[c] + 1;
    }
    lastSeen[c] = i;
    const len = i - start + 1;
    if (len > best) best = len;
  }
  return best;
}
