export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  const memo = new Map<string, bigint>();

  function dp(pos: number, sum: number, tight: boolean): bigint {
    // Base case: processed all digits
    if (pos === n) {
      return sum === target ? 1n : 0n;
    }

    // Check memoization
    const key = `${pos},${sum},${tight}`;
    if (memo.has(key)) {
      return memo.get(key)!;
    }

    // Prune: sum already exceeds target
    if (sum > target) {
      return 0n;
    }

    // Prune: can't reach target even with all remaining digits as 9
    const maxRemainingSum = 9 * (n - pos);
    if (sum + maxRemainingSum < target) {
      return 0n;
    }

    // Determine max digit at this position
    const maxDigit = tight ? parseInt(limit[pos]) : 9;

    let count = 0n;
    for (let digit = 0; digit <= maxDigit; digit++) {
      const newSum = sum + digit;
      const newTight = tight && (digit === maxDigit);
      count += dp(pos + 1, newSum, newTight);
    }

    memo.set(key, count);
    return count;
  }

  return dp(0, 0, true);
}
