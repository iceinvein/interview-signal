Implement this function in `solution.ts`:

```ts
export function minWindowSubsequence(s: string, t: string): string;
```

You are given two strings `s` and `t`. Return the shortest contiguous substring of `s` that contains `t` as a subsequence: every character of `t` must appear in the substring in the same order as in `t`, though not necessarily next to each other. For example, `"axbxc"` contains `"abc"` as a subsequence, but `"cba"` does not.

If no substring of `s` qualifies, return the empty string `""`. If several qualifying substrings share the shortest length, return the one that starts at the smallest position in `s`.

Constraints:

- `1 <= s.length <= 20000`
- `1 <= t.length <= 100`
- `s` and `t` consist of lowercase English letters (`a` to `z`) only.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
