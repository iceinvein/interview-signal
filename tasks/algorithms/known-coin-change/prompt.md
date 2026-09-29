Implement this function in `solution.ts`:

```ts
export function coinChange(coins: number[], amount: number): number;
```

You are given the coin denominations `coins` and a target `amount`. You may use as many coins of each denomination as you like. Return the smallest number of coins whose values add up to exactly `amount`. If no combination of coins adds up to `amount`, return `-1`. An `amount` of `0` needs `0` coins.

Constraints:

- `1 <= coins.length <= 12`
- `1 <= coins[i] <= 2^31 - 1`
- All denominations in `coins` are distinct.
- `0 <= amount <= 2000`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
