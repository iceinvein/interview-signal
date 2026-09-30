export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  // ways[k][s]: number of k-digit strings (leading zeros allowed) with digit sum s
  const maxS = Math.max(target, 0);
  const ways: bigint[][] = [];
  for (let k = 0; k <= n; k++) {
    ways.push(new Array<bigint>(maxS + 1).fill(0n));
  }
  ways[0][0] = 1n;
  for (let k = 1; k <= n; k++) {
    for (let s = 0; s <= maxS; s++) {
      let total = 0n;
      for (let d = 0; d <= 9 && d <= s; d++) total += ways[k - 1][s - d];
      ways[k][s] = total;
    }
  }

  let result = 0n;
  let prefix = 0;
  for (let i = 0; i < n; i++) {
    const cur = limit.charCodeAt(i) - 48;
    const remaining = n - i - 1;
    for (let d = 0; d < cur; d++) {
      const need = target - prefix - d;
      if (need >= 0) result += ways[remaining][need];
    }
    prefix += cur;
    if (prefix > target) return result;
  }
  if (prefix === target) result += 1n;
  return result;
}
