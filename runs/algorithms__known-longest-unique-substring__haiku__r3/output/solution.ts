export function lengthOfLongestSubstring(s: string): number {
  const charSet = new Set<string>();
  let maxLength = 0;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];

    // If character already exists, remove characters from left until it's gone
    while (charSet.has(char)) {
      charSet.delete(s[left]);
      left++;
    }

    // Add the current character
    charSet.add(char);

    // Update max length of window
    maxLength = Math.max(maxLength, right - left + 1);
  }

  return maxLength;
}
