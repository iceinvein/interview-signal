export function longestSubstringAtMostTwice(s: string): number {
  const charCount = new Map<string, number>();
  let left = 0;
  let maxLength = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];
    charCount.set(char, (charCount.get(char) || 0) + 1);

    while (charCount.get(char)! > 2) {
      const leftChar = s[left];
      charCount.set(leftChar, charCount.get(leftChar)! - 1);
      if (charCount.get(leftChar) === 0) {
        charCount.delete(leftChar);
      }
      left++;
    }

    maxLength = Math.max(maxLength, right - left + 1);
  }

  return maxLength;
}
