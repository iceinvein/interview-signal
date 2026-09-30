export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const INF = 1e9;
  let dp = new Array<number>(amount + 1).fill(INF);
  dp[0] = 0;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    const cnt = counts[i];
    if (cnt <= 0) continue;
    const next = new Array<number>(amount + 1).fill(INF);
    const dqIdx = new Int32Array(amount + 2);
    const dqVal = new Float64Array(amount + 2);
    for (let r = 0; r < c && r <= amount; r++) {
      let head = 0;
      let tail = 0;
      for (let t = 0, j = r; j <= amount; t++, j += c) {
        const v = dp[j] >= INF ? INF : dp[j] - t;
        while (tail > head && dqVal[tail - 1] >= v) tail--;
        dqIdx[tail] = t;
        dqVal[tail] = v;
        tail++;
        while (dqIdx[head] < t - cnt) head++;
        const best = dqVal[head];
        next[j] = best >= INF ? INF : best + t;
      }
    }
    dp = next;
  }
  return dp[amount] >= INF ? -1 : dp[amount];
}
