export function lengthOfLongestSubstring(s: string): number {
  let maxLength = 0;
  let left = 0;
  const charIndex = new Map<string, number>();

  for (let right = 0; right < s.length; right++) {
    const char = s[right];

    if (charIndex.has(char)) {
      left = Math.max(left, charIndex.get(char)! + 1);
    }

    charIndex.set(char, right);
    maxLength = Math.max(maxLength, right - left + 1);
  }

  return maxLength;
}
