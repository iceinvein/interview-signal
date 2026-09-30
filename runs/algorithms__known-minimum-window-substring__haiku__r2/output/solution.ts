export function minWindow(s: string, t: string): string {
  if (t.length > s.length) return "";

  const targetFreq = new Map<string, number>();
  for (const char of t) {
    targetFreq.set(char, (targetFreq.get(char) || 0) + 1);
  }

  const windowFreq = new Map<string, number>();
  let formed = 0;
  const required = targetFreq.size;

  let left = 0;
  let minLen = Infinity;
  let minStart = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];
    windowFreq.set(char, (windowFreq.get(char) || 0) + 1);

    if (
      targetFreq.has(char) &&
      windowFreq.get(char) === targetFreq.get(char)
    ) {
      formed++;
    }

    while (formed === required && left <= right) {
      if (right - left + 1 < minLen) {
        minLen = right - left + 1;
        minStart = left;
      }

      const leftChar = s[left];
      windowFreq.set(leftChar, windowFreq.get(leftChar)! - 1);

      if (
        targetFreq.has(leftChar) &&
        windowFreq.get(leftChar)! < targetFreq.get(leftChar)!
      ) {
        formed--;
      }

      left++;
    }
  }

  return minLen === Infinity ? "" : s.substring(minStart, minStart + minLen);
}
