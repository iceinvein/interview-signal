export function lengthOfLongestSubstring(s: string): number {
  const lastSeen = new Int32Array(127);
  let windowStart = 0;
  let longest = 0;

  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    windowStart = Math.max(windowStart, lastSeen[code]);
    longest = Math.max(longest, i - windowStart + 1);
    lastSeen[code] = i + 1;
  }

  return longest;
}
