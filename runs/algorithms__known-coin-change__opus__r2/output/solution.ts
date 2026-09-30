export function coinChange(coins: number[], amount: number): number {
  const INF = amount + 1;
  const dp = new Array<number>(amount + 1).fill(INF);
  dp[0] = 0;
  for (const coin of coins) {
    if (coin > amount) continue;
    for (let a = coin; a <= amount; a++) {
      const candidate = dp[a - coin] + 1;
      if (candidate < dp[a]) dp[a] = candidate;
    }
  }
  return dp[amount] >= INF ? -1 : dp[amount];
}
