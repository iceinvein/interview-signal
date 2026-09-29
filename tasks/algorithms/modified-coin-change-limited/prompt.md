Implement this function in `solution.ts`:

```ts
export function coinChangeLimited(coins: number[], counts: number[], amount: number): number;
```

You are given the coin denominations `coins`, and for each position `i`, `counts[i]` is how many coins of value `coins[i]` you have. You cannot use more than `counts[i]` coins of value `coins[i]`. Return the smallest number of coins whose values add up to exactly `amount`. If no selection of the available coins adds up to `amount`, return `-1`. An `amount` of `0` needs `0` coins.

Constraints:

- `1 <= coins.length <= 12`
- `counts.length === coins.length`
- `1 <= coins[i] <= 10000`
- All denominations in `coins` are distinct.
- `0 <= counts[i] <= 10000`; a count of `0` means that denomination is unavailable.
- `0 <= amount <= 10000`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
