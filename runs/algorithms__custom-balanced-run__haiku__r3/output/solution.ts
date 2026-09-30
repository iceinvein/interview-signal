export function longestBalancedRun(s: string): number {
  const balanceMap = new Map<number, number>();
  balanceMap.set(0, -1);

  let maxLength = 0;
  let balance = 0;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];

    if (char === 'x') {
      balance++;
    } else if (char === 'y') {
      balance--;
    }

    if (balanceMap.has(balance)) {
      const prevIndex = balanceMap.get(balance)!;
      maxLength = Math.max(maxLength, i - prevIndex);
    } else {
      balanceMap.set(balance, i);
    }
  }

  return maxLength;
}
