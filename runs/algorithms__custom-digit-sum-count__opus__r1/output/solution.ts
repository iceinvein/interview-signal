export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  if (target < 0 || target > 9 * n) return 0n;

  // ways[len][s] = number of digit strings of length len (leading zeros allowed) with digit sum s
  const ways: bigint[][] = [[1n]];
  for (let len = 1; len <= n; len++) {
    const prev = ways[len - 1];
    const cur: bigint[] = new Array(9 * len + 1).fill(0n);
    for (let s = 0; s < prev.length; s++) {
      if (prev[s] === 0n) continue;
      for (let d = 0; d <= 9; d++) cur[s + d] += prev[s];
    }
    ways.push(cur);
  }

  let count = 0n;
  let prefix = 0;
  for (let i = 0; i < n; i++) {
    const digit = limit.charCodeAt(i) - 48;
    const rest = n - i - 1;
    for (let d = 0; d < digit; d++) {
      const need = target - prefix - d;
      if (need >= 0 && need <= 9 * rest) count += ways[rest][need];
    }
    prefix += digit;
    if (prefix > target) return count;
  }
  if (prefix === target) count += 1n;
  return count;
}
