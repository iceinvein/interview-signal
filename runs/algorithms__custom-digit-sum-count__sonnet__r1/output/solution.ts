export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  // ways[k][s]: number of k-digit strings (leading zeros allowed) with digit sum s
  const ways: bigint[][] = [];
  for (let k = 0; k <= n; k++) {
    ways.push(new Array<bigint>(target + 1).fill(0n));
  }
  ways[0][0] = 1n;
  for (let k = 1; k <= n; k++) {
    for (let s = 0; s <= target; s++) {
      let total = 0n;
      for (let d = 0; d <= 9 && d <= s; d++) total += ways[k - 1][s - d];
      ways[k][s] = total;
    }
  }

  let count = 0n;
  let prefix = 0;
  for (let i = 0; i < n; i++) {
    const digit = limit.charCodeAt(i) - 48;
    const remaining = n - i - 1;
    for (let d = 0; d < digit; d++) {
      const need = target - prefix - d;
      if (need >= 0) count += ways[remaining][need];
    }
    prefix += digit;
    if (prefix > target) return count;
  }
  if (prefix === target) count += 1n;
  return count;
}
