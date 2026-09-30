export function coinChange(coins: number[], amount: number): number {
  const unreachable = amount + 1;
  const minimumCoins = new Array<number>(amount + 1).fill(unreachable);
  minimumCoins[0] = 0;

  for (const coin of coins) {
    for (let value = coin; value <= amount; value++) {
      minimumCoins[value] = Math.min(
        minimumCoins[value],
        minimumCoins[value - coin] + 1,
      );
    }
  }

  return minimumCoins[amount] === unreachable ? -1 : minimumCoins[amount];
}
