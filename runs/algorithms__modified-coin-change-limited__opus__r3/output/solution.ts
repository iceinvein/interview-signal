export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const INF = Number.MAX_SAFE_INTEGER;
  const dp = new Array<number>(amount + 1).fill(INF);
  dp[0] = 0;

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    // Cap usable count: never need more than amount / coin of this coin.
    let remaining = Math.min(counts[i], Math.floor(amount / coin));
    // Binary splitting turns the bounded item into 0/1 items of sizes 1, 2, 4, ..., rest.
    let k = 1;
    while (remaining > 0) {
      const take = Math.min(k, remaining);
      remaining -= take;
      k *= 2;
      const value = take * coin;
      for (let s = amount; s >= value; s--) {
        const prev = dp[s - value];
        if (prev !== INF && prev + take < dp[s]) dp[s] = prev + take;
      }
    }
  }

  return dp[amount] === INF ? -1 : dp[amount];
}
