export function longestBalancedRun(s: string): number {
  const firstPos = new Map<number, number>();
  firstPos.set(0, -1);

  let balance = 0;
  let maxLength = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'x') {
      balance++;
    } else if (s[i] === 'y') {
      balance--;
    }

    if (firstPos.has(balance)) {
      maxLength = Math.max(maxLength, i - firstPos.get(balance)!);
    } else {
      firstPos.set(balance, i);
    }
  }

  return maxLength;
}
