export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const INF = Number.MAX_SAFE_INTEGER;
  const dp = new Array<number>(amount + 1).fill(INF);
  dp[0] = 0;
  for (let i = 0; i < coins.length; i++) {
    let remaining = counts[i];
    for (let k = 1; remaining > 0; k *= 2) {
      const take = Math.min(k, remaining);
      remaining -= take;
      const w = coins[i] * take;
      for (let s = amount; s >= w; s--) {
        const prev = dp[s - w];
        if (prev !== INF && prev + take < dp[s]) dp[s] = prev + take;
      }
    }
  }
  return dp[amount] === INF ? -1 : dp[amount];
}
