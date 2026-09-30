export function lengthOfLongestSubstring(s: string): number {
  const lastSeen = new Array<number>(127).fill(-1);
  let start = 0;
  let longest = 0;

  for (let end = 0; end < s.length; end++) {
    const code = s.charCodeAt(end);
    if (lastSeen[code] >= start) {
      start = lastSeen[code] + 1;
    }
    lastSeen[code] = end;
    longest = Math.max(longest, end - start + 1);
  }

  return longest;
}
