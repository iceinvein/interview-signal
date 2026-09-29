export function lengthOfLongestSubstring(s: string): number {
  const lastSeenAt = new Int32Array(128).fill(-1);
  let windowStart = 0;
  let longest = 0;
  for (let end = 0; end < s.length; end++) {
    const code = s.charCodeAt(end);
    // An earlier copy left of the window no longer constrains it.
    if (lastSeenAt[code] >= windowStart) windowStart = lastSeenAt[code] + 1;
    lastSeenAt[code] = end;
    longest = Math.max(longest, end - windowStart + 1);
  }
  return longest;
}
