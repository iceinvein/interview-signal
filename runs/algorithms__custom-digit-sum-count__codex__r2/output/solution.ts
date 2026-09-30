export function countDigitSum(limit: string, target: number): bigint {
  if (target > 9 * limit.length) return 0n;

  // Leading zeros let every value use the same number of digits as limit.
  let loose: bigint[] = Array(target + 1).fill(0n);
  let tight: bigint[] = Array(target + 1).fill(0n);
  tight[0] = 1n;

  for (let i = 0; i < limit.length; i++) {
    const bound = limit.charCodeAt(i) - 48;
    const nextLoose: bigint[] = Array(target + 1).fill(0n);
    const nextTight: bigint[] = Array(target + 1).fill(0n);

    for (let sum = 0; sum <= target; sum++) {
      if (loose[sum] !== 0n) {
        for (let digit = 0; digit <= 9 && sum + digit <= target; digit++) {
          nextLoose[sum + digit] += loose[sum];
        }
      }

      if (tight[sum] !== 0n) {
        for (let digit = 0; digit <= bound && sum + digit <= target; digit++) {
          if (digit === bound) {
            nextTight[sum + digit] += tight[sum];
          } else {
            nextLoose[sum + digit] += tight[sum];
          }
        }
      }
    }

    loose = nextLoose;
    tight = nextTight;
  }

  return loose[target] + tight[target];
}
