export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  if (target < 0 || target > 9 * n) return 0n;

  // ways[k][s]: count of k-digit strings (leading zeros allowed) with digit sum s
  const ways: bigint[][] = [];
  ways.push(new Array<bigint>(target + 1).fill(0n));
  ways[0][0] = 1n;
  for (let k = 1; k <= n; k++) {
    const row = new Array<bigint>(target + 1).fill(0n);
    for (let s = 0; s <= target; s++) {
      let total = 0n;
      for (let d = 0; d <= 9 && d <= s; d++) total += ways[k - 1][s - d];
      row[s] = total;
    }
    ways.push(row);
  }

  let count = 0n;
  let prefixSum = 0;
  for (let i = 0; i < n; i++) {
    const digit = limit.charCodeAt(i) - 48;
    const remaining = n - i - 1;
    for (let d = 0; d < digit; d++) {
      const need = target - prefixSum - d;
      if (need < 0) break;
      count += ways[remaining][need];
    }
    prefixSum += digit;
    if (prefixSum > target) return count;
  }
  if (prefixSum === target) count += 1n;
  return count;
}
