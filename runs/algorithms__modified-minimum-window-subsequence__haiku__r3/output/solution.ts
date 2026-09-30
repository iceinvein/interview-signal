export function minWindowSubsequence(s: string, t: string): string {
  let minLength = Infinity;
  let startPosition = -1;

  // Try each starting position
  for (let start = 0; start < s.length; start++) {
    // Find minimum end position for this start where substring contains t as subsequence
    let tIndex = 0;
    let end = start;

    while (end < s.length && tIndex < t.length) {
      if (s[end] === t[tIndex]) {
        tIndex++;
      }
      end++;
    }

    // If we matched all characters of t
    if (tIndex === t.length) {
      const length = end - start;
      if (length < minLength) {
        minLength = length;
        startPosition = start;
      }
    }
  }

  return startPosition === -1 ? "" : s.substring(startPosition, startPosition + minLength);
}
