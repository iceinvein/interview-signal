export function longestSubstringAtMostTwice(s: string): number {
  const counts = new Array<number>(128).fill(0);
  let best = 0;
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right);
    counts[c]++;
    while (counts[c] > 2) {
      counts[s.charCodeAt(left)]--;
      left++;
    }
    if (right - left + 1 > best) best = right - left + 1;
  }
  return best;
}
