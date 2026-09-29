Implement this function in `solution.ts`:

```ts
export function countDigitSum(limit: string, target: number): bigint;
```

The digit sum of a non-negative integer is the sum of its decimal digits, so `509` has digit sum `5 + 0 + 9 = 14` and `0` has digit sum `0`.

You are given `limit` as a decimal string and an integer `target`. Count the integers `x` with `0 <= x <= limit` (both ends included) whose digit sum equals `target`, and return the count as a `bigint`.

Example: `countDigitSum("20", 2)` is `3n`, counting `2`, `11` and `20`.

Constraints:

- `limit` is a decimal integer from `"0"` to `"1000000000000000000"` (10^18) inclusive, with no leading zeros, a sign or other characters.
- `0 <= target <= 200`
- The count can exceed `Number.MAX_SAFE_INTEGER`, which is why the result is a `bigint`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
