export function lengthOfLongestSubstring(s: string): number {
  const last = new Int32Array(128).fill(-1);
  let best = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) & 127;
    if (last[c] >= start) start = last[c] + 1;
    last[c] = i;
    if (i - start + 1 > best) best = i - start + 1;
  }
  return best;
}
