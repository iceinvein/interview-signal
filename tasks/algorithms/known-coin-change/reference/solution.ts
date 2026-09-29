export function coinChange(coins: number[], amount: number): number {
  const fewest = new Array<number>(amount + 1).fill(Infinity);
  fewest[0] = 0;
  for (let total = 1; total <= amount; total++) {
    for (const coin of coins) {
      if (coin <= total && fewest[total - coin] + 1 < fewest[total]) {
        fewest[total] = fewest[total - coin] + 1;
      }
    }
  }
  return fewest[amount] === Infinity ? -1 : fewest[amount];
}
