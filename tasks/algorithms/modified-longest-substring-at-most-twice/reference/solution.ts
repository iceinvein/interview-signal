export function longestSubstringAtMostTwice(s: string): number {
  const countInWindow = new Int32Array(128);
  let windowStart = 0;
  let longest = 0;
  for (let end = 0; end < s.length; end++) {
    const code = s.charCodeAt(end);
    countInWindow[code]++;
    while (countInWindow[code] > 2) {
      countInWindow[s.charCodeAt(windowStart)]--;
      windowStart++;
    }
    longest = Math.max(longest, end - windowStart + 1);
  }
  return longest;
}
