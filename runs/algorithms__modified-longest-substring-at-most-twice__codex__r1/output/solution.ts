export function longestSubstringAtMostTwice(s: string): number {
  const counts = new Uint8Array(127);
  let left = 0;
  let longest = 0;

  for (let right = 0; right < s.length; right++) {
    const code = s.charCodeAt(right);
    counts[code]++;

    while (counts[code] > 2) {
      counts[s.charCodeAt(left)]--;
      left++;
    }

    longest = Math.max(longest, right - left + 1);
  }

  return longest;
}
