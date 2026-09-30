export function countDigitSum(limit: string, target: number): bigint {
  const digits = Array.from(limit, (digit) => digit.charCodeAt(0) - 48);
  if (target > 9 * digits.length) return 0n;

  let equal = Array<bigint>(target + 1).fill(0n);
  let smaller = Array<bigint>(target + 1).fill(0n);
  equal[0] = 1n;

  for (const limitDigit of digits) {
    const nextEqual = Array<bigint>(target + 1).fill(0n);
    const nextSmaller = Array<bigint>(target + 1).fill(0n);

    for (let sum = 0; sum <= target; sum++) {
      for (let digit = 0; digit <= 9 && sum + digit <= target; digit++) {
        nextSmaller[sum + digit] += smaller[sum];
        if (digit < limitDigit) {
          nextSmaller[sum + digit] += equal[sum];
        } else if (digit === limitDigit) {
          nextEqual[sum + digit] += equal[sum];
        }
      }
    }

    equal = nextEqual;
    smaller = nextSmaller;
  }

  return equal[target] + smaller[target];
}
