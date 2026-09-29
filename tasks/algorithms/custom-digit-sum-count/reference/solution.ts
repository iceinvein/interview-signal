export function countDigitSum(limit: string, target: number): bigint {
  const n = limit.length;
  // free[len][s]: strings of `len` unrestricted digits whose digits sum to s.
  const free: bigint[][] = [Array.from({ length: target + 1 }, (_, s) => (s === 0 ? 1n : 0n))];
  for (let len = 1; len < n; len++) {
    const prev = free[len - 1];
    const row: bigint[] = new Array(target + 1);
    let window = 0n;
    for (let s = 0; s <= target; s++) {
      window += prev[s];
      if (s >= 10) window -= prev[s - 10];
      row[s] = window;
    }
    free.push(row);
  }

  let count = 0n;
  let prefixSum = 0;
  for (let i = 0; i < n && prefixSum <= target; i++) {
    const digit = Number(limit[i]);
    const rest = free[n - 1 - i];
    // Any smaller digit here frees every later position.
    for (let d = 0; d < digit && prefixSum + d <= target; d++) count += rest[target - prefixSum - d];
    prefixSum += digit;
  }
  if (prefixSum === target) count += 1n;
  return count;
}
