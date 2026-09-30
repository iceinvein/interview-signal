export function longestBalancedRun(s: string): number {
  const firstOccurrence = new Map<number, number>();
  firstOccurrence.set(0, -1);

  let balance = 0;
  let maxLength = 0;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === 'x') {
      balance++;
    } else if (char === 'y') {
      balance--;
    }

    if (firstOccurrence.has(balance)) {
      const prevIndex = firstOccurrence.get(balance)!;
      const length = i - prevIndex;
      maxLength = Math.max(maxLength, length);
    } else {
      firstOccurrence.set(balance, i);
    }
  }

  return maxLength;
}
