export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  const memo = new Map<string, bigint>();

  function dp(pos: number, digitSum: number, isTight: boolean): bigint {
    // Base case: processed all digits
    if (pos === n) {
      return digitSum === target ? 1n : 0n;
    }

    // Early termination: digit sum already exceeds target
    if (digitSum > target) {
      return 0n;
    }

    const key = `${pos},${digitSum},${isTight}`;
    if (memo.has(key)) {
      return memo.get(key)!;
    }

    // If tight, max digit is limit[pos]; otherwise it's 9
    const maxDigit = isTight ? parseInt(limit[pos]) : 9;
    let result = 0n;

    for (let digit = 0; digit <= maxDigit; digit++) {
      const newTight = isTight && digit === maxDigit;
      result += dp(pos + 1, digitSum + digit, newTight);
    }

    memo.set(key, result);
    return result;
  }

  return dp(0, 0, true);
}
