export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  let dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;

  for (let j = 0; j < coins.length; j++) {
    const coin = coins[j];
    const count = counts[j];
    const newDp = dp.slice();

    for (let a = 0; a <= amount; a++) {
      if (dp[a] !== Infinity) {
        for (let k = 1; k <= count && a + k * coin <= amount; k++) {
          newDp[a + k * coin] = Math.min(newDp[a + k * coin], dp[a] + k);
        }
      }
    }

    dp = newDp;
  }

  return dp[amount] === Infinity ? -1 : dp[amount];
}
