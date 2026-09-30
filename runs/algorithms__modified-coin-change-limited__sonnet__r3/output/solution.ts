export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const INF = Number.MAX_SAFE_INTEGER;
  const dp = new Array<number>(amount + 1).fill(INF);
  dp[0] = 0;
  for (let i = 0; i < coins.length; i++) {
    let remaining = counts[i];
    // Binary splitting: bundles of 1, 2, 4, ... cover every count up to counts[i].
    for (let take = 1; remaining > 0; take *= 2) {
      const k = Math.min(take, remaining);
      remaining -= k;
      const value = k * coins[i];
      for (let j = amount; j >= value; j--) {
        const prev = dp[j - value];
        if (prev !== INF && prev + k < dp[j]) dp[j] = prev + k;
      }
    }
  }
  return dp[amount] === INF ? -1 : dp[amount];
}
