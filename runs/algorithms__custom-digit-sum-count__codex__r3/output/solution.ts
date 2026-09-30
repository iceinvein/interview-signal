export function countDigitSum(limit: string, target: number): bigint {
  if (target > 9 * limit.length) return 0n;

  // Numbers with fewer digits are represented with leading zeroes.
  let loose = Array<bigint>(target + 1).fill(0n);
  let prefixSum = 0;

  for (const char of limit) {
    const bound = char.charCodeAt(0) - 48;
    const next = Array<bigint>(target + 1).fill(0n);

    for (let sum = 0; sum <= target; sum++) {
      const count = loose[sum] ?? 0n;
      if (count === 0n) continue;
      for (let digit = 0; digit <= 9 && sum + digit <= target; digit++) {
        next[sum + digit] = (next[sum + digit] ?? 0n) + count;
      }
    }

    for (let digit = 0; digit < bound; digit++) {
      if (prefixSum + digit <= target) {
        next[prefixSum + digit] = (next[prefixSum + digit] ?? 0n) + 1n;
      }
    }

    loose = next;
    prefixSum += bound;
  }

  return (loose[target] ?? 0n) + (prefixSum === target ? 1n : 0n);
}
