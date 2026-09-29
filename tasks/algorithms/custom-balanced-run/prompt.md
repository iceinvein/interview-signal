Implement this function in `solution.ts`:

```ts
export function longestBalancedRun(s: string): number;
```

A contiguous substring of `s` is balanced when it contains exactly as many lowercase `'x'` characters as lowercase `'y'` characters. Every other character (including uppercase `'X'` and `'Y'`) counts towards the substring's length but not towards the balance, so a substring holding no `'x'` and no `'y'` at all is balanced. Return the length of the longest balanced substring of `s`. The empty substring is always balanced, so the answer is `0` when nothing longer qualifies, and `0` for the empty string.

Example: for `"xxayx"` the answer is `3`. The substrings `"xay"` and `"ayx"` each hold one `'x'` and one `'y'`, while every substring of length 4 or 5 holds more `'x'` than `'y'`.

Constraints:

- `0 <= s.length <= 1000000`
- `s` consists of printable ASCII characters.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
